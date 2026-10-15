import {
  COMMON_STATUS,
  ETH_TO_SYS_TRANSFER_STATUS,
  ITransfer,
  SYS_TO_ETH_TRANSFER_STATUS,
} from "@contexts/Transfer/types";
import TransferModel from "models/transfer";
import { createHash, timingSafeEqual } from "crypto";
import { SponsorWalletService } from "./sponsor-wallet";
import {
  assertNewTransfer,
  assertTransferIdentityUnchanged,
  assertValidTransferPayload,
  TransferValidationError,
} from "./transfer-validation";
import { assertTransferCompleted } from "./transfer-completion";
import { canonicalizeTransferProgress, verifiedTransferProgressStatus } from "./transfer-progress";
import { getVerifiedFreezeBurnReceipt } from "./sponsor-utxo-eligibility";

export class TransferWriteUnauthorizedError extends Error {
  constructor() {
    super("Transfer write is not authorized");
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

const toPublicTransfer = (transfer: unknown): ITransfer => {
  const source =
    typeof transfer === "object" &&
    transfer !== null &&
    "toObject" in transfer &&
    typeof transfer.toObject === "function"
      ? transfer.toObject()
      : { ...(transfer as Record<string, unknown>) };
  delete source.writeTokenHash;
  delete source.progressStatus;
  delete source.__v;
  return source as ITransfer;
};

export class TransferService {
  private sponsorWalletService = new SponsorWalletService();
  constructor() {}

  async getAll(params: Partial<ITransfer>): Promise<ITransfer[]> {
    const filters: (keyof ITransfer)[] = [
      "nevmAddress",
      "utxoAddress",
      "utxoXpub",
    ];
    const queryConstraints = filters.reduce((acc, key) => {
      if (key in params && typeof params[key] === "string") {
        acc.push({ [key]: params[key] as string });
      }
      return acc;
    }, [] as Record<string, string>[]);
    return TransferModel.find({
      $or: queryConstraints,
    }).sort({ createdAt: -1 }) as unknown as ITransfer[];
  }

  async getTransfer(id: string): Promise<ITransfer> {
    const transfer = await TransferModel.findOne({ id });

    if (!transfer) {
      throw new TransferNotFoundError();
    }

    return transfer as unknown as ITransfer;
  }

  async getAuthorizedTransfer(
    id: string,
    writeTokens?: WriteTokenCandidates
  ): Promise<ITransfer> {
    const transfer = await TransferModel.findOne({ id: { $eq: id } }).select(
      "+writeTokenHash"
    );

    if (!transfer) throw new TransferNotFoundError();
    if (
      !transfer.writeTokenHash ||
      !findMatchingWriteToken(writeTokens, transfer.writeTokenHash)
    ) {
      throw new TransferWriteUnauthorizedError();
    }

    const authorized = toPublicTransfer(transfer);
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
    // A repeated recovery must not reset later progress or rewrite any logs.
    const recoverable = new Set<string>([ETH_TO_SYS_TRANSFER_STATUS.FREEZE_BURN_SYS,
      ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_FREEZE_BURN_SYS, COMMON_STATUS.ERROR]);
    if (sourceLogs.length && receiptLogs.length && !recoverable.has(existing.status)) {
      return existing;
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

  private async updateSponsorStatuses(transfer: ITransfer): Promise<void> {
    const submitProofsTxLog = transfer.logs.find(
      (log) => log.status === "submit-proofs"
    );
    if (submitProofsTxLog) {
      const { hash } = submitProofsTxLog.payload.data;
      if (hash) {
        await this.sponsorWalletService.updateSponsorWalletTransactionStatus(
          hash
        );
      }
    }
    const sponsoredUtxoLogs = transfer.logs.filter(
      (log) =>
        log.status === ETH_TO_SYS_TRANSFER_STATUS.MINT_SYSX ||
        log.status === ETH_TO_SYS_TRANSFER_STATUS.BURN_SYSX ||
        log.status === SYS_TO_ETH_TRANSFER_STATUS.BURN_SYSX
    );
    for (const log of sponsoredUtxoLogs) {
      const { tx } = log.payload.data;
      if (tx) {
        await this.sponsorWalletService.updateUtxoSponsorWalletTransactionStatus(
          tx
        );
      }
    }
  }

  async upsertTransfer(
    transfer: ITransfer,
    writeTokens?: WriteTokenCandidates
  ): Promise<TransferWriteResult> {
    assertValidTransferPayload(transfer);
    const existing = await TransferModel.findOne({ id: transfer.id }).select(
      "+writeTokenHash +progressStatus"
    );

    if (!existing) {
      const [writeToken] = normalizeWriteTokens(writeTokens);
      if (!writeToken) {
        throw new TransferWriteUnauthorizedError();
      }
      assertNewTransfer(transfer);
      const created = await TransferModel.create({
        ...toTransferUpdate(transfer),
        id: transfer.id,
        version: "v2",
        createdAt: Date.now(),
        writeTokenHash: hashWriteToken(writeToken),
        progressStatus: transfer.status,
      });

      return { transfer: toPublicTransfer(created), writeToken };
    }

    const writeToken = existing.writeTokenHash
      ? findMatchingWriteToken(writeTokens, existing.writeTokenHash)
      : undefined;
    if (!writeToken || !existing.writeTokenHash) {
      throw new TransferWriteUnauthorizedError();
    }

    assertTransferIdentityUnchanged(transfer, existing as unknown as ITransfer);
    const priorProgress = {
      ...toPublicTransfer(existing), status: existing.progressStatus ?? existing.status,
    } as ITransfer;
    transfer = await canonicalizeTransferProgress(transfer, priorProgress);
    if (transfer.status === COMMON_STATUS.COMPLETED) {
      await assertTransferCompleted(transfer);
    }
    await this.updateSponsorStatuses(transfer);
    const updatedTransfer = await TransferModel.findOneAndUpdate(
      {
        id: transfer.id,
        writeTokenHash: existing.writeTokenHash,
        __v: existing.__v === undefined ? { $exists: false } : existing.__v,
      },
      { $set: { ...toTransferUpdate(transfer),
        progressStatus: verifiedTransferProgressStatus(transfer, priorProgress) }, $inc: { __v: 1 } },
      { new: true }
    );
    if (!updatedTransfer) {
      throw new TransferWriteConflictError();
    }

    return { transfer: toPublicTransfer(updatedTransfer), writeToken };
  }
}
