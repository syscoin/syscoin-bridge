import {
  COMMON_STATUS,
  ETH_TO_SYS_TRANSFER_STATUS,
  ITransfer,
  ITransferLog,
  SYS_TO_ETH_TRANSFER_STATUS,
} from "@contexts/Transfer/types";
import TransferModel from "models/transfer";
import { verifyTransferCreationAuthorization } from "utils/api/transfer-creation-authorization";
import { isValidUtxoAccount } from "utils/utxo-account";
import { createHash, timingSafeEqual } from "crypto";
import { SponsorWalletService } from "./sponsor-wallet";
import {
  assertNewTransfer,
  assertNewTransferLogs,
  assertTransferIdentityUnchanged,
  assertValidTransferPayload,
  TransferValidationError,
} from "./transfer-validation";
import { assertTransferCompleted } from "./transfer-completion";
import {
  canonicalizeTransferProgress,
  verifiedTransferProgressStatus,
  type TransferHistoryEvidence,
} from "./transfer-progress";
import { getVerifiedFreezeBurnReceipt } from "./sponsor-utxo-eligibility";
import { continueNevmTransferAfterError, isErrorLog, knownTransferProgressStatus } from "utils/transfer-progress";

export class TransferWriteUnauthorizedError extends Error {
  constructor(message = "Transfer write is not authorized") {
    super(message);
    this.name = "TransferWriteUnauthorizedError";
    Object.setPrototypeOf(this, TransferWriteUnauthorizedError.prototype);
  }
}

export class TransferNotFoundError extends Error {
  constructor() {
    super("Transfer not found");
    this.name = "TransferNotFoundError";
    Object.setPrototypeOf(this, TransferNotFoundError.prototype);
  }
}

export class TransferWriteConflictError extends Error {
  constructor() {
    super("Transfer changed while saving; refresh before retrying");
    this.name = "TransferWriteConflictError";
    Object.setPrototypeOf(this, TransferWriteConflictError.prototype);
  }
}

type TransferWriteResult = {
  transfer: ITransfer;
  writeToken: string;
};

type WriteTokenCandidates = string | readonly string[] | undefined;

type TransferCreationOptions = {
  origin: string | null;
  authorization: unknown;
  charge: () => Promise<void>;
  chargeContractVerification?: () => Promise<void>;
};

const hashWriteToken = (writeToken: string) =>
  createHash("sha256").update(writeToken, "utf8").digest("hex");

const writeTokenMatches = (writeToken: string, expectedHash: string) => {
  const actual = Uint8Array.from(
    Buffer.from(hashWriteToken(writeToken), "hex")
  );
  const expected = Uint8Array.from(Buffer.from(expectedHash, "hex"));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

const normalizeWriteTokens = (writeTokens: WriteTokenCandidates): string[] =>
  typeof writeTokens === "string"
    ? [writeTokens]
    : Array.from(new Set(writeTokens ?? [])).filter(Boolean);

const findMatchingWriteToken = (
  writeTokens: WriteTokenCandidates,
  expectedHash: string
) =>
  normalizeWriteTokens(writeTokens).find((writeToken) =>
    writeTokenMatches(writeToken, expectedHash)
  );

const toTransferUpdate = (transfer: ITransfer) => ({
  type: transfer.type,
  status: transfer.status,
  logs: transfer.logs,
  utxoAddress: transfer.utxoAddress,
  utxoXpub: transfer.utxoXpub,
  nevmAddress: transfer.nevmAddress,
  amount: transfer.amount,
  agreedToTerms: transfer.agreedToTerms,
  useSysx: transfer.useSysx,
  utxoAssetType: transfer.utxoAssetType,
  updatedAt: Date.now(),
});

export const TRANSFER_HISTORY_PAGE_SIZE = 50;
export const MAX_TRANSFER_HISTORY_PAGE = 100;

const projectTransfer = (transfer: unknown, options: {
  privateAccount?: boolean;
  diagnostics?: boolean;
  summary?: boolean;
} = {}): ITransfer => {
  const source =
    typeof transfer === "object" &&
    transfer !== null &&
    "toObject" in transfer &&
    typeof transfer.toObject === "function"
      ? transfer.toObject()
      : { ...(transfer as Record<string, unknown>) };
  const logs: ITransferLog[] = Array.isArray(source.logs) ? source.logs : [];
  source.logs = logs;
  // Only persisted server data may supply the hidden progress checkpoint.
  const checkpoint = knownTransferProgressStatus(source as ITransfer, source.progressStatus);
  const continuation = continueNevmTransferAfterError(source as ITransfer, checkpoint);
  // Do not forward any stored/caller-supplied recovery flag as authority.
  delete source.freezeRecoveryAllowed;
  if (source.type === "nevm-to-sys" && continuation.status === COMMON_STATUS.ERROR) {
    source.freezeRecoveryAllowed = checkpoint !== undefined;
  }
  delete source.writeTokenHash;
  delete source.progressStatus;
  const historyEvidence: TransferHistoryEvidence | undefined = source.historyEvidence;
  source.historyPublic = Boolean(historyEvidence?.sourceTransactionHash);
  if (historyEvidence && !options.privateAccount && !options.diagnostics &&
      !historyEvidence.utxoAddresses.includes(source.utxoAddress)) {
    source.utxoAddress = historyEvidence.utxoAddresses[0];
  }
  delete source.historyEvidence;
  delete source.__v;
  if (!options.privateAccount) delete source.utxoXpub;
  if (options.summary) {
    source.logs = [];
  } else if (!options.diagnostics) {
    source.logs = logs.map((log) => {
      // Free-form history text can contain provider URLs and wallet metadata.
      const error = isErrorLog(log);
      return {
        status: log.status,
        date: log.date,
        payload: {
          message: error ? "Transfer action failed" : "Transfer progress",
          data: error ? { error: "Transfer action failed" } : log.payload.data,
          previousStatus: log.payload.previousStatus,
        },
      };
    });
  }
  return { ...source, status: continuation.status } as ITransfer;
};

export class TransferService {
  private sponsorWalletService = new SponsorWalletService();
  constructor() {}

  async getAll(params: Partial<ITransfer>, page = 1): Promise<ITransfer[]> {
    const queryConstraints: Record<string, string>[] = [];
    if (typeof params.nevmAddress === "string") {
      queryConstraints.push({ "historyEvidence.nevmAddress": params.nevmAddress.toLowerCase() });
    }
    if (typeof params.utxoAddress === "string") {
      queryConstraints.push({ "historyEvidence.utxoAddresses": params.utxoAddress });
    }
    if (typeof params.utxoXpub === "string") {
      const accountHash = createHash("sha256").update(params.utxoXpub).digest("hex");
      queryConstraints.push({ "historyEvidence.utxoAccountHash": accountHash });
    }
    if (!queryConstraints.length) return [];
    const transfers = await TransferModel.find({
      $or: queryConstraints,
      ...(params.version ? { version: params.version } : {}),
    }).select("-logs -utxoXpub +progressStatus +historyEvidence")
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * TRANSFER_HISTORY_PAGE_SIZE)
      .limit(TRANSFER_HISTORY_PAGE_SIZE + 1)
      .maxTimeMS(2500);
    return transfers.map((transfer) => projectTransfer(transfer, { summary: true }));
  }

  async getTransfer(id: string, writeTokens?: WriteTokenCandidates): Promise<ITransfer> {
    if (typeof id !== "string" || id.trim().length === 0) {
      throw new TransferValidationError("Invalid transfer ID");
    }
    const transfer = await TransferModel.findOne({ id: { $eq: id } }).select(
      writeTokens?.length
        ? "+progressStatus +historyEvidence +writeTokenHash"
        : "+progressStatus +historyEvidence"
    );

    if (!transfer) {
      throw new TransferNotFoundError();
    }

    const diagnostics = Boolean(writeTokens?.length && transfer.writeTokenHash &&
      findMatchingWriteToken(writeTokens, transfer.writeTokenHash));
    if (!diagnostics && !transfer.historyEvidence?.sourceTransactionHash) {
      throw new TransferNotFoundError();
    }
    return projectTransfer(transfer, { diagnostics });
  }

  async getAuthorizedTransfer(
    id: string,
    writeTokens?: WriteTokenCandidates
  ): Promise<ITransfer> {
    const transfer = await TransferModel.findOne({ id: { $eq: id } }).select(
      "+writeTokenHash +progressStatus +historyEvidence"
    );

    if (!transfer) throw new TransferNotFoundError();
    if (
      !transfer.writeTokenHash ||
      !findMatchingWriteToken(writeTokens, transfer.writeTokenHash)
    ) {
      throw new TransferWriteUnauthorizedError();
    }

    const authorized = projectTransfer(transfer, { privateAccount: true, diagnostics: true });
    // Older stored rows predate payload validation. Do not forward malformed
    // accounts or transaction references to sponsored transaction builders.
    assertValidTransferPayload(authorized);
    return authorized;
  }

  async recoverFreezeBurn(
    id: string, suppliedHash: string, writeTokens?: WriteTokenCandidates
  ): Promise<ITransfer> {
    const existing = await this.getAuthorizedTransfer(id, writeTokens);
    if (!/^0x[0-9a-f]{64}$/i.test(suppliedHash)) {
      throw new TransferValidationError("Invalid freeze and burn transaction hash");
    }
    const hash = suppliedHash.toLowerCase();
    const sourceLogs = existing.logs.filter((log) =>
      log.status === ETH_TO_SYS_TRANSFER_STATUS.FREEZE_BURN_SYS && log.payload.data.hash
    );
    const receiptLogs = existing.logs.filter((log) =>
      log.status === ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_FREEZE_BURN_SYS && log.payload.data.transactionHash
    );
    if ([...sourceLogs.map((log) => log.payload.data.hash),
      ...receiptLogs.map((log) => log.payload.data.transactionHash)]
      .some((value) => String(value).toLowerCase() !== hash)) {
      throw new TransferWriteConflictError();
    }
    if (existing.type !== "nevm-to-sys" || existing.version !== "v2") {
      throw new TransferValidationError("Recovery is only available for V2 NEVM to SYS transfers");
    }
    if (existing.status === COMMON_STATUS.ERROR && existing.freezeRecoveryAllowed !== true) {
      throw new TransferWriteConflictError();
    }
    // A repeated recovery must not reset later progress or rewrite any logs.
    const recoverable = new Set<string>([ETH_TO_SYS_TRANSFER_STATUS.FREEZE_BURN_SYS,
      ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_FREEZE_BURN_SYS, COMMON_STATUS.ERROR]);
    if (sourceLogs.length && receiptLogs.length && !recoverable.has(existing.status)) {
      return {
        ...projectTransfer(existing, { diagnostics: true }),
        historyPublic: existing.historyPublic,
      };
    }
    if (!recoverable.has(existing.status)) {
      throw new TransferWriteConflictError();
    }
    let receipt;
    try { receipt = await getVerifiedFreezeBurnReceipt(existing, hash); }
    catch (error) {
      throw new TransferValidationError(error instanceof Error ? error.message : "Unable to verify freeze and burn");
    }
    const date = Date.now();
    const logs = [...existing.logs];
    if (!sourceLogs.length) logs.push({ status: ETH_TO_SYS_TRANSFER_STATUS.FREEZE_BURN_SYS,
      date, payload: { message: "Freeze and burn SYS", data: { hash } } });
    if (!receiptLogs.length) logs.push({ status: ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_FREEZE_BURN_SYS,
      date: date + 1, payload: { message: "Confirm NEVM Transaction", data: receipt } });
    // Normal canonicalization, capability checks and version CAS remain the only writer.
    const result = await this.upsertTransfer({ ...existing, logs,
      status: ETH_TO_SYS_TRANSFER_STATUS.MINT_SYSX }, writeTokens);
    return result.transfer;
  }

  private async updateSponsorStatuses(logs: ITransferLog[]): Promise<void> {
    const nevmHashes = new Set<string>();
    const utxoHashes = new Set<string>();
    for (const { status, payload: { data } } of logs) {
      if (status === SYS_TO_ETH_TRANSFER_STATUS.SUBMIT_PROOFS && data.hash) {
        nevmHashes.add(data.hash.toLowerCase());
      }
      if ((status === ETH_TO_SYS_TRANSFER_STATUS.MINT_SYSX ||
        status === SYS_TO_ETH_TRANSFER_STATUS.BURN_SYSX) && data.tx) {
        utxoHashes.add(data.tx.toLowerCase());
      }
    }
    for (const hash of Array.from(nevmHashes)) {
      await this.sponsorWalletService.updateSponsorWalletTransactionStatus(hash);
    }
    for (const hash of Array.from(utxoHashes)) {
      await this.sponsorWalletService.updateUtxoSponsorWalletTransactionStatus(hash);
    }
  }

  async upsertTransfer(
    transfer: ITransfer,
    writeTokens?: WriteTokenCandidates,
    creation?: TransferCreationOptions
  ): Promise<TransferWriteResult> {
    assertValidTransferPayload(transfer);
    const existing = await TransferModel.findOne({ id: transfer.id }).select(
      "+writeTokenHash +progressStatus +historyEvidence"
    );

    if (!existing) {
      const [writeToken] = normalizeWriteTokens(writeTokens);
      if (!writeToken) {
        throw new TransferWriteUnauthorizedError();
      }
      assertNewTransfer(transfer);
      if (!creation) throw new TransferWriteUnauthorizedError();
      if (!(await verifyTransferCreationAuthorization(
        transfer, creation.origin, writeToken, creation.authorization,
        creation.chargeContractVerification ?? creation.charge
      ))) {
        throw new TransferWriteUnauthorizedError(
          "Transfer authorization is invalid or expired. Sign with the selected NEVM wallet. Smart wallets must be deployed."
        );
      }
      await creation.charge();
      const created = await TransferModel.create({
        ...toTransferUpdate(transfer),
        id: transfer.id,
        version: "v2",
        createdAt: Date.now(),
        writeTokenHash: hashWriteToken(writeToken),
        progressStatus: transfer.status,
      });

      return { transfer: projectTransfer(created, { diagnostics: true }), writeToken };
    }

    const writeToken = existing.writeTokenHash
      ? findMatchingWriteToken(writeTokens, existing.writeTokenHash)
      : undefined;
    if (!writeToken || !existing.writeTokenHash) {
      throw new TransferWriteUnauthorizedError();
    }

    // A cleared/unknown checkpoint cannot be recreated by a public ERROR save.
    // Only the independent signed administrator override can release this state.
    if (existing.status === COMMON_STATUS.ERROR &&
      !knownTransferProgressStatus(existing as unknown as ITransfer, existing.progressStatus)) {
      throw new TransferWriteConflictError();
    }

    // Public responses never include the account xpub. Restore the stored
    // account after authenticating the writer, and validate supplied values.
    if (transfer.utxoXpub === undefined && existing.utxoXpub !== undefined) {
      if (existing.utxoXpub && !isValidUtxoAccount(existing.utxoXpub)) {
        throw new TransferValidationError("Invalid stored UTXO account");
      }
      transfer = { ...transfer, utxoXpub: existing.utxoXpub };
    }
    assertTransferIdentityUnchanged(transfer, existing as unknown as ITransfer);
    const priorProgress = {
      ...projectTransfer(existing, { privateAccount: true, diagnostics: true }),
      status: existing.progressStatus ?? existing.status,
    } as ITransfer;
    assertNewTransferLogs(transfer.logs, priorProgress.logs);
    let historyEvidence: TransferHistoryEvidence | undefined;
    transfer = await canonicalizeTransferProgress(transfer, priorProgress, (evidence) => {
      const previous = existing.historyEvidence;
      historyEvidence = previous?.sourceTransactionHash === evidence.sourceTransactionHash &&
        previous.utxoAccountHash && !evidence.utxoAccountHash
        ? {
            ...evidence,
            utxoAccountHash: previous.utxoAccountHash,
            utxoAddresses: Array.from(new Set([...evidence.utxoAddresses, ...previous.utxoAddresses])),
          }
        : evidence;
    });
    if (transfer.status === COMMON_STATUS.COMPLETED) {
      await assertTransferCompleted(transfer);
    }
    await this.updateSponsorStatuses(transfer.logs);
    const updatedTransfer = await TransferModel.findOneAndUpdate(
      {
        id: transfer.id,
        writeTokenHash: existing.writeTokenHash,
        __v: existing.__v === undefined ? { $exists: false } : existing.__v,
      },
      {
        $set: {
          ...toTransferUpdate(transfer),
          progressStatus: verifiedTransferProgressStatus(transfer, priorProgress),
          ...(historyEvidence ? { historyEvidence } : {}),
        },
        ...(!historyEvidence && existing.historyEvidence ? { $unset: { historyEvidence: 1 } } : {}),
        $inc: { __v: 1 },
      },
      { new: true }
    );
    if (!updatedTransfer) {
      throw new TransferWriteConflictError();
    }

    return {
      transfer: {
        ...projectTransfer(updatedTransfer, { diagnostics: true }),
        historyPublic: Boolean(historyEvidence),
      },
      writeToken,
    };
  }
}
