import { ITransfer } from "@contexts/Transfer/types";
import { SYSX_ASSET_GUID } from "@contexts/Transfer/constants";
import * as secp256k1 from "@bitcoinerlab/secp256k1";
import { createHash, randomUUID } from "crypto";
import SponsorUtxoReservation from "models/sponsor-utxo-reservation";
import SponsorWalletTransactions, {
  ISponsorWalletTransaction,
  SponsorWalletTransactionAction,
} from "models/sponsor-wallet-transactions";
import { syscoin, UTXOTransaction, utils as syscoinUtils } from "syscoinjs-lib";
import web3 from "utils/get-web3";
import { exportPsbtWithPrevouts } from "utils/psbt-prevouts";
import { toSyscoinBaseUnits } from "utils/syscoin-amount";
import {
  MAINNET_BLOCKBOOK_URL,
  resolveUtxoBlockbookUrl,
} from "utils/syscoin-urls";
import { TransactionConfig } from "web3-core";
import { getConfirmedUtxoBroadcastConflict } from "./sponsor-utxo-conflict";
export { syscoinTxIdFromWitnessStrippedHex } from "utils/syscoin-txid";

const SUBMIT_PROOFS_ACTION: SponsorWalletTransactionAction = "submit-proofs";
const UTXO_MINT_ACTION: SponsorWalletTransactionAction = "mint-sysx";
const UTXO_BURN_ACTION: SponsorWalletTransactionAction = "burn-sysx";
const DEFAULT_UTXO_FEE_RATE = 10;
const SPONSOR_RESERVATION_LEASE_MS = 10 * 60_000;
const MAX_SPONSORED_BURN_INPUTS = 24;
const MAX_SPONSOR_UTXO_CANDIDATES = 24;
const SPONSOR_PROTOCOL_VERSION = 2;

export class SponsorshipInProgressError extends Error {
  constructor() {
    super("Sponsorship is already in progress");
    this.name = "SponsorshipInProgressError";
    Object.setPrototypeOf(this, SponsorshipInProgressError.prototype);
  }
}

export class SponsorNonceRecoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SponsorNonceRecoveryError";
    Object.setPrototypeOf(this, SponsorNonceRecoveryError.prototype);
  }
}

export class SponsorUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SponsorUnavailableError";
    Object.setPrototypeOf(this, SponsorUnavailableError.prototype);
  }
}

type SponsorUtxo = {
  txid?: string;
  txId?: string;
  vout: number;
  value: string | number;
  confirmations?: number;
  assetInfo?: unknown;
};

type SysxUtxo = SponsorUtxo & { assetInfo: { value: string } };

export type SponsoredUtxoResult = {
  sponsored: true;
  status: "signature-required" | "pending" | "success";
  txid?: string;
  psbt?: UTXOTransaction;
};

type SponsorPlaceholderResult = {
  created: boolean;
  transaction: ISponsorWalletTransaction;
};

const duplicateKeyCode = 11000;

const getUtxoBlockbookUrl = () =>
  resolveUtxoBlockbookUrl(process.env.UTXO_RPC_URL) ??
  resolveUtxoBlockbookUrl(process.env.UTXO_EXPLORER) ??
  MAINNET_BLOCKBOOK_URL;

const getUtxoNetwork = () =>
  process.env.IS_TESTNET === "true"
    ? syscoinUtils.syscoinNetworks.testnet
    : syscoinUtils.syscoinNetworks.mainnet;

const isDuplicateKeyError = (error: unknown) => {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number }).code === duplicateKeyCode
  );
};

const isInsufficientFundsError = (error: unknown) => {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const value = error as { code?: string; error?: string; message?: string };
  return (
    value.code === "INSUFFICIENT_FUNDS" ||
    value.error === "INSUFFICIENT_FUNDS" ||
    value.message?.toLowerCase().includes("insufficient funds") === true
  );
};

export class SponsorWalletService {
  public async getExistingProofSponsorship(
    transferId: string,
    sourceTxHash: string
  ): Promise<ISponsorWalletTransaction | null> {
    const normalizedSource = sourceTxHash.toLowerCase();
    const existing = await SponsorWalletTransactions.findOne({
      action: SUBMIT_PROOFS_ACTION,
      $or: [{ transferId }, { sourceTxHash: normalizedSource }],
    });
    if (!existing?.transaction?.hash) {
      return null;
    }

    await this.recoverExistingSponsorTransaction(
      existing,
      SUBMIT_PROOFS_ACTION,
      normalizedSource
    );
    return existing;
  }

  public async sponsorTransaction(
    transferId: string,
    transactionConfig: Omit<TransactionConfig, "nonce">,
    action: SponsorWalletTransactionAction = SUBMIT_PROOFS_ACTION,
    sourceTxHash?: string
  ): Promise<ISponsorWalletTransaction> {
    if (action === SUBMIT_PROOFS_ACTION) {
      if (!sourceTxHash) {
        throw new Error(
          "sourceTxHash is required for submit-proofs sponsorship"
        );
      }
    }

    const normalizedSource = sourceTxHash?.toLowerCase();

    const reservationQuery = {
      action,
      $or: [
        { transferId },
        ...(normalizedSource ? [{ sourceTxHash: normalizedSource }] : []),
      ],
    };
    const existingTransaction = await SponsorWalletTransactions.findOne(
      reservationQuery
    );

    if (existingTransaction?.transaction?.hash) {
      await this.recoverExistingSponsorTransaction(
        existingTransaction,
        action,
        normalizedSource
      );
      return existingTransaction;
    }

    let placeholder: ISponsorWalletTransaction | null = null;
    if (
      existingTransaction?.status === "pending" &&
      !existingTransaction.transaction?.hash
    ) {
      placeholder = await this.acquireStaleSponsorPlaceholder(
        transferId,
        action,
        normalizedSource
      );
      if (!placeholder) {
        throw new SponsorshipInProgressError();
      }
    }

    const privateKey = process.env.NEVM_SPONSOR_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("NEVM sponsor wallet is not configured");
    }

    const sender = web3.eth.accounts.privateKeyToAccount(privateKey);
    await this.assertNoUnsafeLegacySponsorTransactions(sender.address);

    // Reserve (transferId, action) and (action, sourceTxHash) before nonce /
    // estimate / sign so concurrent aliases of the same burn cannot each mint
    // a sponsor signature.
    if (!placeholder) {
      const placeholderResult = await this.createSponsorPlaceholder(
        transferId,
        action,
        sender.address,
        normalizedSource
      );
      placeholder = placeholderResult.transaction;

      if (placeholder.transaction?.hash) {
        await this.recoverExistingSponsorTransaction(
          placeholder,
          action,
          normalizedSource
        );
        return placeholder;
      }

      if (!placeholderResult.created && placeholder.status === "pending") {
        const stalePlaceholder = await this.acquireStaleSponsorPlaceholder(
          transferId,
          action,
          normalizedSource
        );
        if (!stalePlaceholder) {
          throw new SponsorshipInProgressError();
        }
        placeholder = stalePlaceholder;
      }

      if (!placeholderResult.created && placeholder.status === "failed") {
        const retryPlaceholder = await this.acquireFailedSponsorPlaceholder(
          transferId,
          action,
          normalizedSource
        );
        if (!retryPlaceholder) {
          const inFlight = await SponsorWalletTransactions.findOne(
            reservationQuery
          );
          if (inFlight?.transaction?.hash) {
            await this.recoverExistingSponsorTransaction(
              inFlight,
              action,
              normalizedSource
            );
            return inFlight;
          }
          throw new SponsorshipInProgressError();
        }
        placeholder = retryPlaceholder;
      }

      if (
        !placeholderResult.created &&
        placeholder.status !== "pending" &&
        placeholder.status !== "failed"
      ) {
        throw new Error("Sponsorship reservation is incomplete");
      }
    }

    let committedTransaction: ISponsorWalletTransaction | null = null;
    try {
      const nonce = await this.recoverSponsorNonceQueue(sender.address);
      const gasPrice = await web3.eth.getGasPrice();
      let gas: number;
      try {
        gas = await web3.eth.estimateGas({
          ...transactionConfig,
          from: sender.address,
        });
      } catch (e) {
        console.error("estimateGas error", e);
        throw e instanceof Error
          ? e
          : new Error("Gas estimation failed; refusing to sponsor transaction");
      }

      const signedTransaction = await sender.signTransaction({
        ...transactionConfig,
        from: sender.address,
        gasPrice: web3.utils.toHex(gasPrice),
        gas: web3.utils.toHex(gas),
        nonce,
      });

      if (
        signedTransaction.rawTransaction === undefined ||
        signedTransaction.transactionHash === undefined
      ) {
        throw new Error("Raw transaction is undefined");
      }

      committedTransaction = await this.commitSignedSponsorTransaction(
        placeholder,
        normalizedSource,
        signedTransaction.transactionHash,
        signedTransaction.rawTransaction,
        nonce
      );
      await this.broadcastSponsorTransaction(committedTransaction);
      return committedTransaction;
    } catch (error) {
      if (!committedTransaction) {
        await this.failSponsorReservation(placeholder);
      }
      if (isDuplicateKeyError(error)) {
        throw new SponsorshipInProgressError();
      }
      throw error;
    }
  }

  public async sponsorUtxoMint(
    transfer: ITransfer,
    sourceTxHash: string
  ): Promise<SponsoredUtxoResult> {
    if (!transfer.utxoAddress) {
      throw new Error("Missing UTXO address");
    }

    const { sponsorAddress, sponsorWif } = this.getUtxoSponsorConfig();
    const existing = await this.getExistingUtxoSponsorship(
      transfer.id,
      UTXO_MINT_ACTION,
      sourceTxHash
    );
    if (existing?.transaction?.hash) {
      await this.recoverUtxoSponsorBroadcast(existing);
      return {
        sponsored: true,
        status: existing.status === "success" ? "success" : "pending",
        txid: existing.transaction.hash,
      };
    }

    const placeholder = await this.claimUtxoSponsorPlaceholder(
      transfer.id,
      UTXO_MINT_ACTION,
      sponsorAddress,
      sourceTxHash,
      existing
    );
    if (placeholder.transaction?.hash) {
      await this.recoverUtxoSponsorBroadcast(placeholder);
      return {
        sponsored: true,
        status: placeholder.status === "success" ? "success" : "pending",
        txid: placeholder.transaction.hash,
      };
    }
    let reservation: { key: string; utxo: SponsorUtxo } | undefined;
    let broadcastStarted = false;
    try {
      reservation = await this.reserveSponsorUtxo(
        sponsorAddress,
        placeholder
      );
      const prepared = await this.prepareSponsoredMint(
        transfer,
        sourceTxHash,
        sponsorAddress,
        reservation.utxo
      );
      const signed = await this.signPreparedUtxo(prepared.psbt, sponsorWif);
      const broadcasting = await this.beginUtxoSponsorBroadcast(
        placeholder,
        signed,
        reservation.key
      );
      broadcastStarted = true;
      await this.markSponsorUtxoBroadcasting(broadcasting);
      await this.finishUtxoSponsorBroadcast(broadcasting);
      return { sponsored: true, status: "pending", txid: signed.txid };
    } catch (error) {
      if (!broadcastStarted) {
        await this.failSponsorReservation(placeholder);
      }
      throw error;
    } finally {
      if (reservation && !broadcastStarted) {
        await this.releaseSponsorUtxoReservation(reservation.key, placeholder);
      }
    }
  }

  public async prepareSponsoredUtxoBurn(
    transfer: ITransfer
  ): Promise<SponsoredUtxoResult> {
    if (!transfer.utxoAddress || !transfer.utxoXpub || !transfer.nevmAddress) {
      throw new Error("Missing transfer addresses");
    }

    const { sponsorAddress } = this.getUtxoSponsorConfig();
    const existing = await this.getExistingUtxoSponsorship(
      transfer.id,
      UTXO_BURN_ACTION
    );
    if (existing?.transaction?.hash) {
      await this.recoverUtxoSponsorBroadcast(existing);
      return {
        sponsored: true,
        status: existing.status === "success" ? "success" : "pending",
        txid: existing.transaction.hash,
      };
    }
    if (existing?.transaction?.rawData && this.hasLiveReservation(existing)) {
      return {
        sponsored: true,
        status: "signature-required",
        psbt: JSON.parse(existing.transaction.rawData) as UTXOTransaction,
      };
    }

    const userUtxos = await this.getEligibleBurnInputs(transfer);
    const placeholder = await this.claimUtxoSponsorPlaceholder(
      transfer.id,
      UTXO_BURN_ACTION,
      sponsorAddress,
      undefined,
      existing
    );
    if (placeholder.transaction?.hash) {
      await this.recoverUtxoSponsorBroadcast(placeholder);
      return {
        sponsored: true,
        status: placeholder.status === "success" ? "success" : "pending",
        txid: placeholder.transaction.hash,
      };
    }
    let preparedStored = false;
    try {
      const sponsorUtxo = await this.selectPreparedSponsorUtxo(sponsorAddress, transfer.id, userUtxos.length);
      const sponsorKey = this.psbtInputKeyFromReservation(sponsorUtxo);
      const prepared = await this.buildSponsoredBurn(
        transfer,
        sponsorAddress,
        sponsorUtxo,
        userUtxos
      );
      const exported = await exportPsbtWithPrevouts(
        prepared.psbt,
        prepared.assets,
        (txid) =>
          syscoinUtils.fetchBackendRawTx(getUtxoBlockbookUrl(), txid)
      );
      await this.storePreparedUtxoBurn(
        placeholder,
        sponsorKey,
        exported
      );
      preparedStored = true;
      return {
        sponsored: true,
        status: "signature-required",
        psbt: exported,
      };
    } catch (error) {
      if (!preparedStored) {
        await this.failSponsorReservation(placeholder);
      }
      if (isDuplicateKeyError(error)) {
        throw new SponsorshipInProgressError();
      }
      throw error;
    }
  }

  public async submitSponsoredUtxoBurn(
    transfer: ITransfer,
    signedTransaction: UTXOTransaction
  ): Promise<SponsoredUtxoResult> {
    const { sponsorAddress, sponsorWif } = this.getUtxoSponsorConfig();
    const placeholder = await SponsorWalletTransactions.findOne({
      transferId: transfer.id,
      action: UTXO_BURN_ACTION,
    });
    if (placeholder?.transaction?.hash) {
      await this.recoverUtxoSponsorBroadcast(placeholder);
      return {
        sponsored: true,
        status: placeholder.status === "success" ? "success" : "pending",
        txid: placeholder.transaction.hash,
      };
    }
    if (
      !placeholder?.transaction?.rawData ||
      !placeholder.utxoReservationKey ||
      !this.hasLiveReservation(placeholder)
    ) {
      throw new Error("Sponsored burn preparation expired; prepare it again");
    }

    const canonicalJson = JSON.parse(
      placeholder.transaction.rawData
    ) as UTXOTransaction;
    const canonical = syscoinUtils.importPsbtFromJson(
      canonicalJson,
      getUtxoNetwork()
    ).psbt;
    const signed = syscoinUtils.importPsbtFromJson(
      signedTransaction,
      getUtxoNetwork()
    ).psbt;
    this.mergeUserSignatures(
      canonical,
      signed,
      placeholder.utxoReservationKey
    );
    const sponsorKey = placeholder.utxoReservationKey;
    this.validatePreparedUserSignatures(canonical, sponsorKey);
    const sourceTxHash = this.getUserInputFingerprint(canonical, sponsorKey);
    const submission = await this.claimSponsoredBurnSubmission(placeholder);
    let reservation: { key: string; utxo: SponsorUtxo } | undefined;
    let broadcastStarted = false;
    try {
      // Older unsigned preparations claimed this key before validating the
      // user's signatures. Only a signed transaction may retain the claim.
      await SponsorWalletTransactions.updateMany(
        { action: UTXO_BURN_ACTION, sourceTxHash, "transaction.hash": { $exists: false } },
        { $unset: { sourceTxHash: "" } }
      );
      reservation = await this.reserveSponsorUtxo(
        sponsorAddress,
        submission,
        sponsorKey
      );
      const sponsorSigned = await this.signPreparedUtxo(canonical, sponsorWif);
      const broadcasting = await this.beginUtxoSponsorBroadcast(
        submission,
        sponsorSigned,
        sponsorKey,
        sourceTxHash
      );
      broadcastStarted = true;
      await this.markSponsorUtxoBroadcasting(broadcasting);
      await this.finishUtxoSponsorBroadcast(broadcasting);
      return { sponsored: true, status: "pending", txid: sponsorSigned.txid };
    } catch (error) {
      if (!broadcastStarted) {
        await this.failSponsorReservation(submission);
      }
      if (isDuplicateKeyError(error)) {
        throw new SponsorshipInProgressError();
      }
      throw error;
    } finally {
      if (reservation && !broadcastStarted) {
        await this.releaseSponsorUtxoReservation(reservation.key, submission);
      }
    }
  }

  private async claimSponsoredBurnSubmission(placeholder: ISponsorWalletTransaction) {
    const claimed = await SponsorWalletTransactions.findOneAndUpdate(
      {
        _id: placeholder._id,
        status: "pending",
        reservationOwner: placeholder.reservationOwner,
        reservationExpiresAt: { $gt: new Date() },
        reservationPhase: "reserved",
        "transaction.hash": { $exists: false },
      },
      { $set: { reservationOwner: randomUUID(), reservationPhase: "signing" } },
      { new: true }
    );
    if (!claimed) throw new SponsorshipInProgressError();
    return claimed;
  }

  private getUtxoSponsorConfig() {
    const sponsorAddress = process.env.UTXO_SPONSOR_ADDRESS;
    const sponsorWif = process.env.UTXO_SPONSOR_WIF;
    if (!sponsorAddress || !sponsorWif) {
      throw new SponsorUnavailableError(
        "UTXO sponsor wallet is not configured"
      );
    }
    return { sponsorAddress, sponsorWif };
  }

  private hasLiveReservation(transaction: ISponsorWalletTransaction) {
    return Boolean(
      transaction.reservationOwner &&
        transaction.reservationExpiresAt &&
        transaction.reservationExpiresAt.getTime() > Date.now()
    );
  }

  private async getExistingUtxoSponsorship(
    transferId: string,
    action: SponsorWalletTransactionAction,
    sourceTxHash?: string
  ) {
    return SponsorWalletTransactions.findOne({
      action,
      $or: [
        { transferId },
        ...(sourceTxHash
          ? [{ sourceTxHash: sourceTxHash.toLowerCase() }]
          : []),
      ],
    });
  }

  private async claimUtxoSponsorPlaceholder(
    transferId: string,
    action: SponsorWalletTransactionAction,
    sponsorAddress: string,
    sourceTxHash?: string,
    existing?: ISponsorWalletTransaction | null
  ): Promise<ISponsorWalletTransaction> {
    if (existing?.reservationPhase === "broadcasting") {
      throw new SponsorshipInProgressError();
    }
    if (existing?.status === "pending") {
      if (this.hasLiveReservation(existing)) {
        throw new SponsorshipInProgressError();
      }
      const stale = await this.acquireStaleSponsorPlaceholder(
        transferId,
        action,
        sourceTxHash
      );
      if (!stale) {
        throw new SponsorshipInProgressError();
      }
      return stale;
    }
    if (existing?.status === "failed") {
      const retry = await this.acquireFailedSponsorPlaceholder(
        transferId,
        action,
        sourceTxHash
      );
      if (!retry) {
        throw new SponsorshipInProgressError();
      }
      return retry;
    }

    const result = await this.createSponsorPlaceholder(
      transferId,
      action,
      sponsorAddress,
      sourceTxHash?.toLowerCase()
    );
    if (!result.created) {
      if (result.transaction.transaction?.hash) {
        return result.transaction;
      }
      throw new SponsorshipInProgressError();
    }
    return result.transaction;
  }

  private async prepareSponsoredMint(
    transfer: ITransfer,
    sourceTxHash: string,
    sponsorAddress: string,
    sponsorUtxo: SponsorUtxo
  ) {
    const syscoinInstance = new syscoin(
      null,
      getUtxoBlockbookUrl(),
      getUtxoNetwork()
    );
    let result;
    try {
      result = await syscoinInstance.assetAllocationMint(
        {
          web3url:
            process.env.NEVM_RPC_URL ??
            process.env.NEXT_PUBLIC_NEVM_RPC_URL ??
            "https://rpc.syscoin.org",
          ethtxid: sourceTxHash,
        },
        { rbf: true },
        null,
        sponsorAddress,
        new syscoinUtils.BN(DEFAULT_UTXO_FEE_RATE),
        sponsorAddress,
        {
          utxos: [{ ...sponsorUtxo, address: sponsorAddress }],
          assets: [],
        }
      );
    } catch (error) {
      if (isInsufficientFundsError(error)) {
        throw new SponsorUnavailableError("UTXO sponsor has insufficient funds");
      }
      throw error;
    }
    if (!result?.psbt) {
      throw new SponsorUnavailableError("Unable to fund sponsored mint");
    }
    return { syscoinInstance, psbt: result.psbt };
  }

  private async buildSponsoredBurn(
    transfer: ITransfer,
    sponsorAddress: string,
    sponsorUtxo: SponsorUtxo,
    userUtxos: SysxUtxo[]
  ) {
    const syscoinInstance = new syscoin(
      null,
      getUtxoBlockbookUrl(),
      getUtxoNetwork()
    );
    const assetMap = new Map([
      [
        SYSX_ASSET_GUID,
        {
          changeAddress: transfer.utxoAddress,
          outputs: [
            {
              value: new syscoinUtils.BN(toSyscoinBaseUnits(transfer.amount)),
              address: transfer.utxoAddress,
            },
          ],
        },
      ],
    ]);
    let result;
    try {
      result = await syscoinInstance.assetAllocationBurn(
        {
          ethaddress: Buffer.from(
            transfer.type === "sys-to-nevm"
              ? transfer.nevmAddress!.replace(/^0x/, "")
              : "",
            "hex"
          ),
        },
        { rbf: true },
        assetMap,
        sponsorAddress,
        new syscoinUtils.BN(DEFAULT_UTXO_FEE_RATE),
        transfer.utxoXpub,
        {
          utxos: [
            ...userUtxos,
            { ...sponsorUtxo, address: sponsorAddress },
          ],
          assets: [
            {
              assetGuid: SYSX_ASSET_GUID,
              maxSupply: "0",
              decimals: 8,
            },
          ],
        }
      );
    } catch (error) {
      if (isInsufficientFundsError(error)) {
        throw new SponsorUnavailableError("UTXO sponsor has insufficient funds");
      }
      throw error;
    }
    if (!result?.psbt) {
      throw new SponsorUnavailableError("Unable to fund sponsored SYSX burn");
    }

    const sponsorKey = this.psbtInputKeyFromReservation(sponsorUtxo);
    const selectedInputs = result.psbt.txInputs.map((input: any) =>
      this.psbtInputKey(input)
    );
    if (!selectedInputs.includes(sponsorKey)) {
      throw new SponsorUnavailableError(
        "SYSX input already carries enough native SYS for its fee"
      );
    }

    this.assertSponsorDoesNotReceiveUserNative(
      result.psbt,
      sponsorAddress,
      sponsorUtxo
    );

    return { psbt: result.psbt, assets: result.assets };
  }

  private assertSponsorDoesNotReceiveUserNative(
    psbt: any,
    sponsorAddress: string,
    sponsorUtxo: SponsorUtxo
  ) {
    const sponsorScript = syscoinUtils.bitcoinjs.address.toOutputScript(
      sponsorAddress,
      getUtxoNetwork()
    );
    const sponsorScriptHex = Buffer.from(sponsorScript).toString("hex");
    const sponsorOutputSats = psbt.txOutputs.reduce(
      (total: bigint, output: any) =>
        Buffer.from(output.script).toString("hex") === sponsorScriptHex
          ? total + BigInt(output.value)
          : total,
      BigInt(0)
    );
    if (sponsorOutputSats > BigInt(sponsorUtxo.value)) {
      throw new SponsorUnavailableError(
        "SYSX inputs contain native SYS and must use the user-funded path"
      );
    }
  }

  private async getEligibleBurnInputs(transfer: ITransfer): Promise<SysxUtxo[]> {
    const response = await fetch(
      `${getUtxoBlockbookUrl()}/api/v2/utxo/${encodeURIComponent(transfer.utxoXpub!)}?confirmed=true`,
      { signal: AbortSignal.timeout(5_000) }
    );
    if (!response.ok) {
      throw new Error("Unable to fetch SYSX inputs");
    }
    const body = (await response.json()) as
      | SponsorUtxo[]
      | { utxos?: SponsorUtxo[] };
    const utxos = Array.isArray(body) ? body : body.utxos;
    if (!Array.isArray(utxos)) {
      throw new Error("Invalid SYSX UTXO response");
    }
    const candidates = utxos.filter((utxo): utxo is SysxUtxo => {
      const asset = utxo?.assetInfo as { assetGuid?: string; value?: string } | undefined;
      return Boolean(
        String(asset?.assetGuid) === SYSX_ASSET_GUID &&
        typeof asset?.value === "string" && /^\d{1,20}$/.test(asset.value) &&
        this.isUsableOutpoint(utxo) &&
        Number.isSafeInteger(utxo.confirmations) && utxo.confirmations! > 0
      );
    });
    candidates.sort((left, right) => {
      const leftAmount = BigInt(left.assetInfo.value);
      const rightAmount = BigInt(right.assetInfo.value);
      return leftAmount === rightAmount ? 0 : leftAmount > rightAmount ? -1 : 1;
    });
    const required = BigInt(toSyscoinBaseUnits(transfer.amount));
    const selected = new Map<string, SysxUtxo>();
    let available = BigInt(0);
    for (const utxo of candidates) {
      const key = this.psbtInputKeyFromReservation(utxo);
      if (selected.has(key)) continue;
      selected.set(key, utxo);
      available += BigInt(utxo.assetInfo.value);
      if (available >= required) return Array.from(selected.values());
      if (selected.size >= MAX_SPONSORED_BURN_INPUTS) break;
    }
    throw new SponsorUnavailableError("Insufficient confirmed SYSX inputs for sponsored burn");
  }

  private async storePreparedUtxoBurn(
    placeholder: ISponsorWalletTransaction,
    utxoReservationKey: string,
    psbt: UTXOTransaction
  ) {
    if (!placeholder.reservationOwner) {
      throw new SponsorshipInProgressError();
    }
    const stored = await SponsorWalletTransactions.findOneAndUpdate(
      {
        _id: placeholder._id,
        status: "pending",
        reservationOwner: placeholder.reservationOwner,
        reservationExpiresAt: { $gt: new Date() },
        "transaction.hash": { $exists: false },
      },
      {
        $set: {
          utxoReservationKey,
          transaction: {
            rawData: JSON.stringify(psbt),
            nonce: 0,
            confirmedHash: "",
          },
        },
      },
      { new: true }
    );
    if (!stored) {
      throw new SponsorshipInProgressError();
    }
  }

  private getUserInputFingerprint(psbt: any, sponsorKey: string) {
    const userInputs = psbt.txInputs
      .map((input: any) => this.psbtInputKey(input))
      .filter((key: string) => key !== sponsorKey)
      .sort();
    if (userInputs.length === 0) {
      throw new Error("Sponsored burn is missing the user SYSX input");
    }
    return createHash("sha256").update(userInputs.join("|")).digest("hex");
  }

  private psbtInputKey(input: { hash: Uint8Array; index: number }) {
    return `${Buffer.from(input.hash).reverse().toString("hex")}:${input.index}`;
  }

  private psbtInputKeyFromReservation(utxo: SponsorUtxo) {
    const txid = utxo.txid ?? utxo.txId;
    if (!txid) {
      throw new Error("Sponsor UTXO is missing its transaction id");
    }
    return `${txid}:${utxo.vout}`;
  }

  private unsignedPsbtFingerprint(psbt: any) {
    return JSON.stringify({
      version: psbt.version,
      locktime: psbt.locktime,
      inputs: psbt.txInputs.map((input: any) => ({
        key: this.psbtInputKey(input),
        sequence: input.sequence,
      })),
      outputs: psbt.txOutputs.map((output: any) => ({
        script: Buffer.from(output.script).toString("hex"),
        value: output.value.toString(),
      })),
    });
  }

  private mergeUserSignatures(canonical: any, signed: any, sponsorKey: string) {
    if (
      this.unsignedPsbtFingerprint(canonical) !==
      this.unsignedPsbtFingerprint(signed)
    ) {
      throw new Error("Signed transaction does not match sponsor preparation");
    }

    canonical.txInputs.forEach((input: any, index: number) => {
      if (this.psbtInputKey(input) === sponsorKey) {
        return;
      }
      const source = signed.data.inputs[index];
      const signatureFields = {
        ...(source.partialSig ? { partialSig: source.partialSig } : {}),
        ...(source.tapKeySig ? { tapKeySig: source.tapKeySig } : {}),
        ...(source.tapScriptSig ? { tapScriptSig: source.tapScriptSig } : {}),
        ...(source.finalScriptSig
          ? { finalScriptSig: source.finalScriptSig }
          : {}),
        ...(source.finalScriptWitness
          ? { finalScriptWitness: source.finalScriptWitness }
          : {}),
      };
      if (Object.keys(signatureFields).length === 0) {
        throw new Error("Pali did not sign every user-owned SYSX input");
      }
      canonical.updateInput(index, signatureFields);
    });
  }

  private validatePreparedUserSignatures(psbt: any, sponsorKey: string) {
    const copy = psbt.clone();
    copy.txInputs.forEach((input: { hash: Uint8Array; index: number }, index: number) => {
      if (this.psbtInputKey(input) === sponsorKey) return;
      const metadata = copy.data.inputs[index];
      if (!metadata.finalScriptSig && !metadata.finalScriptWitness) {
        copy.finalizeInput(index);
      }
      if (!this.validateFinalizedInput(copy, index)) {
        throw new Error("Sponsored UTXO transaction has an invalid user signature");
      }
    });
  }

  private readWitnessStack(buffer: Uint8Array): Buffer[] {
    const source = Buffer.from(buffer);
    let offset = 0;
    const readCompactSize = () => {
      const prefix = source[offset++];
      if (prefix < 0xfd) {
        return prefix;
      }
      if (prefix === 0xfd) {
        const value = source.readUInt16LE(offset);
        offset += 2;
        return value;
      }
      if (prefix === 0xfe) {
        const value = source.readUInt32LE(offset);
        offset += 4;
        return value;
      }
      const value = Number(source.readBigUInt64LE(offset));
      offset += 8;
      return value;
    };
    const count = readCompactSize();
    const stack: Buffer[] = [];
    for (let i = 0; i < count; i += 1) {
      const length = readCompactSize();
      stack.push(source.subarray(offset, offset + length));
      offset += length;
    }
    if (offset !== source.length) {
      throw new Error("Invalid finalized witness encoding");
    }
    return stack;
  }

  private validateFinalizedInput(psbt: any, inputIndex: number) {
    const clone = psbt.clone();
    const metadata = clone.data.inputs[inputIndex];
    const validator = (
      publicKey: Uint8Array,
      hash: Uint8Array,
      signature: Uint8Array
    ) =>
      publicKey.length === 32
        ? secp256k1.verifySchnorr(hash, publicKey, signature)
        : secp256k1.verify(hash, publicKey, signature);

    if (metadata.finalScriptWitness) {
      const witness = this.readWitnessStack(metadata.finalScriptWitness);
      clone.clearFinalizedInput(inputIndex);
      if (witness.length === 2) {
        clone.updateInput(inputIndex, {
          partialSig: [{ signature: witness[0], pubkey: witness[1] }],
        });
      } else if (witness.length === 1) {
        clone.updateInput(inputIndex, { tapKeySig: witness[0] });
      } else {
        return false;
      }
    } else if (metadata.finalScriptSig) {
      const chunks = syscoinUtils.bitcoinjs.script.decompile(
        metadata.finalScriptSig
      );
      if (
        !chunks ||
        chunks.length !== 2 ||
        !(chunks[0] instanceof Uint8Array) ||
        !(chunks[1] instanceof Uint8Array)
      ) {
        return false;
      }
      clone.clearFinalizedInput(inputIndex);
      clone.updateInput(inputIndex, {
        partialSig: [{ signature: chunks[0], pubkey: chunks[1] }],
      });
    } else {
      return false;
    }

    try {
      return clone.validateSignaturesOfInput(inputIndex, validator);
    } catch {
      return false;
    }
  }
  private async signPreparedUtxo(psbt: any, sponsorWif: string) {
    const signed = await syscoinUtils.signWithWIF(
      psbt,
      sponsorWif,
      getUtxoNetwork()
    );
    for (let index = 0; index < signed.txInputs.length; index += 1) {
      if (!this.validateFinalizedInput(signed, index)) {
        throw new Error("Sponsored UTXO transaction has an invalid signature");
      }
    }
    const transaction = signed.extractTransaction();
    const rawTransaction = transaction.toHex();
    return { txid: transaction.getId(), rawTransaction };
  }

  private async broadcastPreparedUtxo(
    rawTransaction: string,
    expectedTxid: string
  ) {
    try {
      const response = await syscoinUtils.sendRawTransaction(
        getUtxoBlockbookUrl(),
        rawTransaction
      );
      if (!response?.result || response.result !== expectedTxid) {
        throw new Error(
          response?.error
            ? JSON.stringify(response.error)
            : "UTXO RPC returned an unexpected transaction id"
        );
      }
    } catch (error) {
      const known = await syscoinUtils
        .fetchBackendRawTx(getUtxoBlockbookUrl(), expectedTxid)
        .catch(() => undefined);
      if (known?.txid !== expectedTxid) {
        throw error;
      }
    }
  }

  private async recoverUtxoSponsorBroadcast(
    transaction: ISponsorWalletTransaction
  ) {
    if (transaction.reservationPhase === "conflicted") {
      await this.clearConflictedUtxoBroadcast(transaction);
      throw new SponsorUnavailableError("A confirmed transaction conflicts with the sponsored transaction");
    }
    if (transaction.reservationPhase !== "broadcasting") {
      return;
    }
    const { hash, rawData } = transaction.transaction;
    if (!hash || !rawData || !transaction.utxoReservationKey) {
      throw new SponsorNonceRecoveryError(
        "Sponsored UTXO broadcast is missing durable transaction data"
      );
    }
    try {
      await this.markSponsorUtxoBroadcasting(transaction);
    } catch (error) {
      if (!(error instanceof SponsorshipInProgressError)) {
        throw error;
      }
      const known = await syscoinUtils
        .fetchBackendRawTx(getUtxoBlockbookUrl(), hash)
        .catch(() => undefined);
      if (known?.txid === hash) {
        const [txid, vout] = transaction.utxoReservationKey.split(":");
        await SponsorUtxoReservation.updateOne(
          { key: transaction.utxoReservationKey },
          { $setOnInsert: {
            txid,
            vout: Number(vout),
            transferId: transaction.transferId,
            status: "spent",
            reservationOwner: transaction.reservationOwner,
            broadcastHash: hash,
          } },
          { upsert: true }
        );
        await this.commitUtxoSponsorTransaction(transaction, hash);
        return;
      }
      if (await this.reconcileConflictedUtxoBroadcast(transaction)) {
        throw new SponsorUnavailableError("A confirmed transaction conflicts with the sponsored transaction");
      }
      const { sponsorAddress } = this.getUtxoSponsorConfig();
      await this.reserveSponsorUtxo(
        sponsorAddress,
        transaction,
        transaction.utxoReservationKey
      );
      await this.markSponsorUtxoBroadcasting(transaction);
    }
    await this.finishUtxoSponsorBroadcast(transaction);
  }

  private async finishUtxoSponsorBroadcast(transaction: ISponsorWalletTransaction) {
    const { hash, rawData } = transaction.transaction;
    try {
      await this.broadcastPreparedUtxo(rawData, hash);
    } catch (error) {
      if (await this.reconcileConflictedUtxoBroadcast(transaction)) {
        throw new SponsorUnavailableError("A confirmed transaction conflicts with the sponsored transaction");
      }
      throw error;
    }
    await this.markSponsorUtxoSpent(transaction);
    await this.commitUtxoSponsorTransaction(transaction, hash);
  }

  private async reconcileConflictedUtxoBroadcast(transaction: ISponsorWalletTransaction) {
    if (transaction.reservationPhase === "conflicted") {
      return this.clearConflictedUtxoBroadcast(transaction);
    }
    const { hash, rawData } = transaction.transaction;
    if (!transaction.utxoReservationKey) return false;
    const conflict = await getConfirmedUtxoBroadcastConflict(
      getUtxoBlockbookUrl(), rawData, hash, transaction.utxoReservationKey
    ).catch(() => null);
    if (!conflict) return false;

    const recorded = await SponsorWalletTransactions.findOneAndUpdate(
      {
        _id: transaction._id,
        status: "pending",
        reservationPhase: "broadcasting",
        "transaction.hash": hash,
      },
      { $set: {
        status: "failed",
        reservationPhase: "conflicted",
        utxoBroadcastConflict: { ...conflict, sponsoredTxid: hash },
      } },
      { new: true }
    );
    if (!recorded) return false;
    return this.clearConflictedUtxoBroadcast(recorded);
  }

  private async clearConflictedUtxoBroadcast(transaction: ISponsorWalletTransaction) {
    const conflict = transaction.utxoBroadcastConflict;
    if (!conflict || !transaction.utxoReservationKey ||
      conflict.sponsoredTxid !== transaction.transaction.hash) {
      throw new SponsorNonceRecoveryError("Sponsored UTXO conflict record is incomplete");
    }
    const lease = this.utxoBroadcastLeaseFilter(transaction);
    if (conflict.sponsorOutputSpent) {
      await SponsorUtxoReservation.updateOne(
        lease,
        { $set: { status: "spent" }, $unset: { expiresAt: "" } }
      );
    } else {
      await SponsorUtxoReservation.deleteOne(lease);
    }
    // Keep the competing spend in the journal. Clear the signed attempt only
    // after its output lease is reconciled, allowing cleanup to resume on retry.
    await SponsorWalletTransactions.updateOne(
      {
        _id: transaction._id,
        reservationPhase: "conflicted",
        "transaction.hash": conflict.sponsoredTxid,
      },
      {
        $set: { transaction: {} },
        $unset: {
          reservationOwner: "",
          reservationExpiresAt: "",
          reservationPhase: "",
          utxoReservationKey: "",
          ...(transaction.action === UTXO_BURN_ACTION ? { sourceTxHash: "" } : {}),
        },
      }
    );
    return conflict.sponsorOutputSpent ? "spent" : "released";
  }

  public async updateSponsorWalletTransactionStatus(transactionHash: string) {
    const transaction = await SponsorWalletTransactions.findOne({
      "transaction.hash": transactionHash,
    });

    if (!transaction || transaction.status !== "pending") {
      return;
    }

    const receipt = await web3.eth.getTransactionReceipt(transactionHash);
    if (!receipt?.blockNumber) {
      return;
    }

    transaction.status = receipt.status ? "success" : "failed";
    transaction.transaction.confirmedHash = receipt.transactionHash;
    await transaction.save();
  }

  public async updateUtxoSponsorWalletTransactionStatus(txid: string) {
    const transaction = await SponsorWalletTransactions.findOne({
      "transaction.hash": txid,
      action: { $in: [UTXO_MINT_ACTION, UTXO_BURN_ACTION] },
    });

    if (!transaction || transaction.status !== "pending") {
      return;
    }

    const rawTransaction = await syscoinUtils
      .fetchBackendRawTx(getUtxoBlockbookUrl(), txid)
      .catch(() => undefined);

    if (rawTransaction?.txid !== txid) {
      return;
    }

    await SponsorWalletTransactions.updateOne(
      { _id: transaction._id, status: "pending", "transaction.hash": txid },
      { $set: { status: "success", "transaction.confirmedHash": txid } }
    );
  }

  private async createSponsorPlaceholder(
    transferId: string,
    action: SponsorWalletTransactionAction,
    walletId: string,
    sourceTxHash?: string
  ): Promise<SponsorPlaceholderResult> {
    const reservationOwner = randomUUID();
    const placeholder = new SponsorWalletTransactions({
      transferId,
      action,
      sourceTxHash,
      sponsorProtocolVersion: SPONSOR_PROTOCOL_VERSION,
      walletId,
      status: "pending",
      transaction: {},
      reservationOwner,
      reservationExpiresAt: new Date(
        Date.now() + SPONSOR_RESERVATION_LEASE_MS
      ),
      reservationPhase: "reserved",
    });

    return placeholder
      .save()
      .then((transaction) => ({ created: true, transaction }))
      .catch(async (error) => {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }

        const duplicate = await SponsorWalletTransactions.findOne({
          action,
          $or: [
            { transferId },
            ...(sourceTxHash ? [{ sourceTxHash }] : []),
          ],
        });
        if (!duplicate) {
          throw error;
        }

        return { created: false, transaction: duplicate };
      });
  }

  private async acquireFailedSponsorPlaceholder(
    transferId: string,
    action: SponsorWalletTransactionAction,
    sourceTxHash?: string
  ): Promise<ISponsorWalletTransaction | null> {
    const reservationOwner = randomUUID();
    return SponsorWalletTransactions.findOneAndUpdate(
      {
        action,
        status: "failed",
        "transaction.hash": { $exists: false },
        $or: [
          { transferId },
          ...(sourceTxHash ? [{ sourceTxHash }] : []),
        ],
      },
      {
        $set: {
          status: "pending",
          transaction: {},
          sponsorProtocolVersion: SPONSOR_PROTOCOL_VERSION,
          reservationOwner,
          reservationExpiresAt: new Date(
            Date.now() + SPONSOR_RESERVATION_LEASE_MS
          ),
          reservationPhase: "reserved",
        },
        $unset: {
          utxoReservationKey: "",
        },
      },
      { new: true }
    );
  }

  private async acquireStaleSponsorPlaceholder(
    transferId: string,
    action: SponsorWalletTransactionAction,
    sourceTxHash?: string
  ): Promise<ISponsorWalletTransaction | null> {
    const now = new Date();
    const leaseCutoff = new Date(Date.now() - SPONSOR_RESERVATION_LEASE_MS);
    const reservationOwner = randomUUID();

    return SponsorWalletTransactions.findOneAndUpdate(
      {
        action,
        status: "pending",
        "transaction.hash": { $exists: false },
        $and: [
          {
            $or: [
              { transferId },
              ...(sourceTxHash ? [{ sourceTxHash }] : []),
            ],
          },
          {
            $or: [
              { reservationExpiresAt: { $lte: now } },
              {
                reservationExpiresAt: { $exists: false },
                updatedAt: { $lte: leaseCutoff },
              },
            ],
          },
        ],
      },
      {
        $set: {
          status: "pending",
          transaction: {},
          sponsorProtocolVersion: SPONSOR_PROTOCOL_VERSION,
          reservationOwner,
          reservationExpiresAt: new Date(
            Date.now() + SPONSOR_RESERVATION_LEASE_MS
          ),
          reservationPhase: "reserved",
          updatedAt: now,
        },
        $unset: {
          utxoReservationKey: "",
        },
      },
      { new: true }
    );
  }

  private async assertNoUnsafeLegacySponsorTransactions(walletId: string) {
    const unsafeRows = await SponsorWalletTransactions.countDocuments({
      walletId,
      "transaction.rawData": { $type: "string" },
      "transaction.nonce": { $type: "number" },
      $or: [
        { action: { $exists: false } },
        {
          action: SUBMIT_PROOFS_ACTION,
          sourceTxHash: { $exists: false },
        },
        {
          action: SUBMIT_PROOFS_ACTION,
          sourceTxHash: null,
        },
      ],
    });

    if (unsafeRows > 0) {
      throw new SponsorNonceRecoveryError(
        "Foundation funding blocked: reconcile legacy signed sponsor rows before V2 sponsorship"
      );
    }
  }

  private async recoverExistingSponsorTransaction(
    sponsorTransaction: ISponsorWalletTransaction,
    action: SponsorWalletTransactionAction,
    normalizedSource?: string
  ): Promise<void> {
    if (
      action === SUBMIT_PROOFS_ACTION &&
      sponsorTransaction.sourceTxHash?.toLowerCase() !== normalizedSource
    ) {
      throw new SponsorNonceRecoveryError(
        "Legacy or mismatched signed sponsorship cannot be reused in V2"
      );
    }
    if (!sponsorTransaction.walletId) {
      throw new SponsorNonceRecoveryError(
        "Signed sponsorship is missing its sponsor wallet identity"
      );
    }

    // Stored acceptance or a recorded receipt is enough to serve the hash.
    // The full queue is reconciled before allocating another wallet nonce.
    if (sponsorTransaction.broadcastAt || sponsorTransaction.status !== "pending") {
      return;
    }

    const { hash } = sponsorTransaction.transaction;
    const known = await Promise.resolve()
      .then(() => web3.eth.getTransaction(hash))
      .catch(() => undefined);
    if (known?.hash?.toLowerCase() === hash.toLowerCase()) {
      await SponsorWalletTransactions.updateOne(
        { _id: sponsorTransaction._id, "transaction.hash": hash },
        { $set: { broadcastAt: new Date() } }
      );
      return;
    }

    await this.recoverSponsorNonceQueue(sponsorTransaction.walletId);
  }

  private async commitSignedSponsorTransaction(
    placeholder: ISponsorWalletTransaction,
    sourceTxHash: string | undefined,
    transactionHash: string,
    rawTransaction: string,
    nonce: number
  ): Promise<ISponsorWalletTransaction> {
    if (!placeholder.reservationOwner) {
      throw new SponsorshipInProgressError();
    }

    const committed = await SponsorWalletTransactions.findOneAndUpdate(
      {
        _id: placeholder._id,
        status: "pending",
        reservationOwner: placeholder.reservationOwner,
        reservationExpiresAt: { $gt: new Date() },
        "transaction.hash": { $exists: false },
      },
      {
        $set: {
          sourceTxHash,
          sponsorProtocolVersion: SPONSOR_PROTOCOL_VERSION,
          status: "pending",
          transaction: {
            hash: transactionHash,
            rawData: rawTransaction,
            nonce,
            confirmedHash: "",
          },
        },
        $unset: {
          reservationOwner: "",
          reservationExpiresAt: "",
          reservationPhase: "",
          utxoReservationKey: "",
        },
      },
      { new: true }
    );

    if (!committed) {
      throw new SponsorshipInProgressError();
    }

    return committed;
  }

  private async beginUtxoSponsorBroadcast(
    placeholder: ISponsorWalletTransaction,
    signed: { txid: string; rawTransaction: string },
    utxoReservationKey: string,
    sourceTxHash?: string
  ): Promise<ISponsorWalletTransaction> {
    if (!placeholder.reservationOwner) {
      throw new SponsorshipInProgressError();
    }

    const renewed = await SponsorWalletTransactions.findOneAndUpdate(
      {
        _id: placeholder._id,
        status: "pending",
        reservationOwner: placeholder.reservationOwner,
        reservationExpiresAt: { $gt: new Date() },
        "transaction.hash": { $exists: false },
      },
      {
        $set: {
          ...(sourceTxHash ? { sourceTxHash } : {}),
          reservationPhase: "broadcasting",
          utxoReservationKey,
          transaction: {
            hash: signed.txid,
            rawData: signed.rawTransaction,
            nonce: 0,
            confirmedHash: "",
          },
        },
      },
      { new: true }
    );

    if (!renewed) {
      throw new SponsorshipInProgressError();
    }

    return renewed;
  }

  private async commitUtxoSponsorTransaction(
    placeholder: ISponsorWalletTransaction,
    transactionHash: string
  ): Promise<ISponsorWalletTransaction> {
    if (!placeholder.reservationOwner) {
      throw new SponsorshipInProgressError();
    }

    const committed = await SponsorWalletTransactions.findOneAndUpdate(
      {
        _id: placeholder._id,
        status: { $in: ["pending", "success"] },
        reservationOwner: placeholder.reservationOwner,
        reservationPhase: "broadcasting",
        "transaction.hash": transactionHash,
      },
      {
        $unset: {
          reservationOwner: "",
          reservationExpiresAt: "",
          reservationPhase: "",
          utxoReservationKey: "",
        },
      },
      { new: true }
    );

    if (committed) return committed;
    const alreadyCommitted = await SponsorWalletTransactions.findOne({
      _id: placeholder._id,
      reservationPhase: { $exists: false },
      "transaction.hash": transactionHash,
    });
    if (!alreadyCommitted) throw new SponsorshipInProgressError();
    return alreadyCommitted;
  }

  private async failSponsorReservation(
    placeholder: ISponsorWalletTransaction
  ): Promise<void> {
    if (!placeholder.reservationOwner) {
      return;
    }

    await SponsorWalletTransactions.updateOne(
      {
        _id: placeholder._id,
        reservationOwner: placeholder.reservationOwner,
        "transaction.hash": { $exists: false },
      },
      {
        $set: { status: "failed" },
        $unset: {
          reservationOwner: "",
          reservationExpiresAt: "",
          reservationPhase: "",
        },
      }
    ).catch(() => undefined);
  }

  private async recoverSponsorNonceQueue(walletId: string): Promise<number> {
    let pendingNonce = await web3.eth.getTransactionCount(walletId, "pending");
    const pendingTransactions = await SponsorWalletTransactions.find({
      action: SUBMIT_PROOFS_ACTION,
      walletId,
      sourceTxHash: { $type: "string" },
      "transaction.rawData": { $type: "string" },
      "transaction.nonce": { $type: "number" },
    }).sort({ "transaction.nonce": 1 });

    for (const pendingTransaction of pendingTransactions) {
      const storedNonce = pendingTransaction.transaction.nonce;
      if (storedNonce < pendingNonce) {
        const knownTransaction = await web3.eth.getTransaction(
          pendingTransaction.transaction.hash
        );
        if (!knownTransaction) {
          throw new SponsorNonceRecoveryError(
            `Sponsor transaction ${pendingTransaction.transaction.hash} was replaced at nonce ${storedNonce}; manual reconciliation is required`
          );
        }
        continue;
      }
      if (storedNonce > pendingNonce) {
        throw new SponsorNonceRecoveryError(
          `Sponsor nonce recovery blocked: missing durable transaction for nonce ${pendingNonce}`
        );
      }

      await this.broadcastSponsorTransaction(pendingTransaction);
      const refreshedNonce = await web3.eth.getTransactionCount(
        walletId,
        "pending"
      );
      if (refreshedNonce <= storedNonce) {
        throw new SponsorshipInProgressError();
      }
      pendingNonce = refreshedNonce;
    }

    return pendingNonce;
  }

  private async broadcastSponsorTransaction(
    sponsorTransaction: ISponsorWalletTransaction
  ): Promise<void> {
    const { hash, rawData, nonce } = sponsorTransaction.transaction ?? {};
    if (
      !hash ||
      !rawData ||
      typeof nonce !== "number" ||
      !sponsorTransaction.walletId
    ) {
      throw new SponsorNonceRecoveryError(
        "Signed sponsor transaction is incomplete and cannot be broadcast"
      );
    }

    await SponsorWalletTransactions.updateOne(
      { _id: sponsorTransaction._id, "transaction.hash": hash },
      { $inc: { broadcastAttempts: 1 } }
    );

    try {
      await this.sendRawSponsorTransaction(rawData, hash);
    } catch (error) {
      const [knownTransaction, pendingNonce] = await Promise.all([
        web3.eth.getTransaction(hash).catch(() => undefined),
        web3.eth
          .getTransactionCount(sponsorTransaction.walletId, "pending")
          .catch(() => undefined),
      ]);
      if (knownTransaction) {
        // Re-broadcasts are idempotent; an "already known" RPC error is safe.
      } else if (pendingNonce !== undefined && pendingNonce > nonce) {
        throw new SponsorNonceRecoveryError(
          `Sponsor transaction ${hash} was replaced at nonce ${nonce}; manual reconciliation is required`
        );
      } else {
        throw error;
      }
    }

    await SponsorWalletTransactions.updateOne(
      { _id: sponsorTransaction._id, "transaction.hash": hash },
      { $set: { broadcastAt: new Date() } }
    );
  }

  private async sendRawSponsorTransaction(
    rawTransaction: string,
    expectedHash: string
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (!settled) {
          settled = true;
          callback();
        }
      };

      try {
        const promiEvent = web3.eth.sendSignedTransaction(rawTransaction);
        promiEvent
          .once("transactionHash", (value: string | { hash?: string }) => {
            const hash = typeof value === "string" ? value : value?.hash;
            if (!hash || hash.toLowerCase() !== expectedHash.toLowerCase()) {
              finish(() =>
                reject(
                  new Error(
                    "Sponsor RPC returned an unexpected transaction hash"
                  )
                )
              );
              return;
            }
            finish(resolve);
          })
          .on("error", (error: Error) => finish(() => reject(error)));
        void promiEvent.catch((error: Error) =>
          finish(() => reject(error))
        );
      } catch (error) {
        finish(() =>
          reject(
            error instanceof Error
              ? error
              : new Error("Unable to broadcast sponsor transaction")
          )
        );
      }
    });
  }

  private async reserveSponsorUtxo(
    sponsorAddress: string,
    placeholder: ISponsorWalletTransaction,
    requiredKey?: string
  ): Promise<{ key: string; utxo: SponsorUtxo }> {
    const utxos = this.eligibleSponsorUtxos(await this.getSponsorUtxos(sponsorAddress));
    const expiresAt = new Date(Date.now() + SPONSOR_RESERVATION_LEASE_MS);
    const candidates = requiredKey
      ? utxos.filter((utxo) => this.psbtInputKeyFromReservation(utxo) === requiredKey)
      : utxos.slice(0, MAX_SPONSOR_UTXO_CANDIDATES);
    let attemptedReconciliation = false;
    for (const utxo of candidates) {
      const key = this.psbtInputKeyFromReservation(utxo);
      const create = async () => {
        try {
          await SponsorUtxoReservation.create({
            key,
            transferId: placeholder.transferId,
            reservationOwner: placeholder.reservationOwner,
            txid: utxo.txid ?? utxo.txId,
            vout: utxo.vout,
            status: "reserved",
            expiresAt,
          });
          return true;
        } catch (error) {
          if (!isDuplicateKeyError(error)) throw error;
          return false;
        }
      };
      if (await create()) {
        return { key, utxo };
      }

      const expired = await SponsorUtxoReservation.deleteOne({
        key,
        status: "reserved",
        expiresAt: { $lte: new Date() },
      });
      if (expired.deletedCount > 0 && await create()) {
        return { key, utxo };
      }
      if (!attemptedReconciliation && placeholder.reservationPhase !== "broadcasting") {
        const stuck = await SponsorWalletTransactions.findOne({
          utxoReservationKey: key,
          reservationPhase: { $in: ["broadcasting", "conflicted"] },
        });
        if (stuck) {
          attemptedReconciliation = true;
          if (await this.reconcileConflictedUtxoBroadcast(stuck) === "released" && await create()) {
            return { key, utxo };
          }
        }
      }
    }

    throw new SponsorUnavailableError("No free UTXO sponsor outputs available");
  }

  private isUsableOutpoint(utxo: SponsorUtxo) {
    return /^[a-f0-9]{64}$/.test(utxo.txid ?? utxo.txId ?? "") &&
      Number.isSafeInteger(utxo.vout) && utxo.vout >= 0 && utxo.vout < 0xffffffff;
  }

  private eligibleSponsorUtxos(utxos: SponsorUtxo[]) {
    return utxos.filter((utxo) => utxo && !utxo.assetInfo && this.isUsableOutpoint(utxo) &&
      Number.isSafeInteger(Number(utxo.value)) && Number(utxo.value) > 0);
  }

  private async selectPreparedSponsorUtxo(sponsorAddress: string, transferId: string, userInputCount: number) {
    const available = this.eligibleSponsorUtxos(await this.getSponsorUtxos(sponsorAddress))
      .slice(0, MAX_SPONSOR_UTXO_CANDIDATES);
    if (available.length === 0) {
      throw new SponsorUnavailableError("No UTXO sponsor outputs available");
    }
    const minimumFeeFunds = (200 + 150 * userInputCount) * DEFAULT_UTXO_FEE_RATE;
    const funded = available.filter((utxo) => Number(utxo.value) >= minimumFeeFunds);
    const candidates = funded.length ? funded : available.slice(0, 1);

    // An unsigned PSBT cannot claim a shared wallet output. Distribute
    // independent preparations over the funded outputs until users sign.
    const start = createHash("sha256").update(transferId).digest().readUInt32BE(0) % candidates.length;
    const keys = candidates.map((utxo) => this.psbtInputKeyFromReservation(utxo));
    const occupied = await SponsorUtxoReservation.find({
      key: { $in: keys },
      $or: [{ status: { $ne: "reserved" } }, { expiresAt: { $gt: new Date() } }],
    }).select("key");
    const occupiedKeys = new Set(occupied.map(({ key }) => key));
    for (let offset = 0; offset < candidates.length; offset += 1) {
      const index = (start + offset) % candidates.length;
      if (!occupiedKeys.has(keys[index])) {
        return candidates[index];
      }
    }
    // Recovery is bounded to one stale signed attempt per request.
    const stuck = await SponsorWalletTransactions.findOne({
      utxoReservationKey: { $in: keys },
      reservationPhase: { $in: ["broadcasting", "conflicted"] },
    });
    if (stuck && await this.reconcileConflictedUtxoBroadcast(stuck) === "released" &&
      !await SponsorUtxoReservation.exists({ key: stuck.utxoReservationKey })) {
      const released = candidates.find((utxo) => this.psbtInputKeyFromReservation(utxo) === stuck.utxoReservationKey);
      if (released) return released;
    }
    throw new SponsorUnavailableError("No free UTXO sponsor outputs available");
  }

  private utxoBroadcastLeaseFilter(transaction: ISponsorWalletTransaction) {
    return {
      key: transaction.utxoReservationKey,
      transferId: transaction.transferId,
      reservationOwner: { $in: [null, transaction.reservationOwner] },
      $or: [
        { broadcastHash: transaction.transaction.hash },
        { broadcastHash: { $exists: false } },
      ],
    };
  }

  private async markSponsorUtxoSpent(transaction: ISponsorWalletTransaction) {
    const result = await SponsorUtxoReservation.updateOne(
      { ...this.utxoBroadcastLeaseFilter(transaction), status: { $in: ["broadcasting", "spent"] } },
      {
        $set: { status: "spent" },
        $unset: { expiresAt: "" },
      }
    );
    if ((result.matchedCount ?? result.modifiedCount) !== 1) {
      throw new Error("UTXO sponsor reservation was lost after broadcast");
    }
  }

  private async markSponsorUtxoBroadcasting(transaction: ISponsorWalletTransaction) {
    const result = await SponsorUtxoReservation.updateOne(
      {
        ...this.utxoBroadcastLeaseFilter(transaction),
        status: { $in: ["reserved", "broadcasting"] },
      },
      {
        $set: { status: "broadcasting", broadcastHash: transaction.transaction.hash },
        $unset: { expiresAt: "" },
      }
    );
    if ((result.matchedCount ?? result.modifiedCount) === 1) {
      return;
    }

    const alreadySpent = await SponsorUtxoReservation.exists({
      ...this.utxoBroadcastLeaseFilter(transaction),
      status: "spent",
    });
    if (!alreadySpent) {
      throw new SponsorshipInProgressError();
    }
  }

  private async releaseSponsorUtxoReservation(
    key: string,
    placeholder: ISponsorWalletTransaction
  ) {
    await SponsorUtxoReservation.deleteOne({
      key,
      transferId: placeholder.transferId,
      reservationOwner: placeholder.reservationOwner,
      status: "reserved",
    });
  }

  private async getSponsorUtxos(sponsorAddress: string): Promise<SponsorUtxo[]> {
    const response = await fetch(
      `${getUtxoBlockbookUrl()}/api/v2/utxo/${encodeURIComponent(sponsorAddress)}`,
      { signal: AbortSignal.timeout(5_000) }
    );

    if (!response.ok) {
      throw new Error("Unable to fetch UTXO sponsor outputs");
    }

    const utxos = (await response.json()) as SponsorUtxo[];
    if (!Array.isArray(utxos)) {
      throw new Error("Invalid UTXO sponsor output response");
    }

    return [...utxos].sort((a, b) => Number(b.value) - Number(a.value));
  }

}

export default SponsorWalletService;
