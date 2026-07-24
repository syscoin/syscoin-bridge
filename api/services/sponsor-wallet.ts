import { ITransfer } from "@contexts/Transfer/types";
import { createHash, randomUUID } from "crypto";
import SponsorUtxoReservation from "models/sponsor-utxo-reservation";
import SponsorWalletTransactions, {
  ISponsorWalletTransaction,
  SponsorWalletTransactionAction,
} from "models/sponsor-wallet-transactions";
import satoshibitcoin from "satoshi-bitcoin";
import { syscoin, utils as syscoinUtils } from "syscoinjs-lib";
import web3 from "utils/get-web3";
import {
  MAINNET_BLOCKBOOK_URL,
  resolveUtxoBlockbookUrl,
} from "utils/syscoin-urls";
import { TransactionConfig } from "web3-core";

/** Bitcoin/Syscoin txid (display hex) from witness-stripped serialization. */
export function syscoinTxIdFromWitnessStrippedHex(txHex: string): string {
  const hex = txHex.startsWith("0x") ? txHex.slice(2) : txHex;
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error("Invalid witness-stripped transaction hex");
  }
  const firstHash = createHash("sha256").update(hex, "hex").digest("hex");
  const hash = createHash("sha256").update(firstHash, "hex").digest("hex");
  return hash.match(/.{2}/g)!.reverse().join("");
}

const SUBMIT_PROOFS_ACTION: SponsorWalletTransactionAction = "submit-proofs";
const UTXO_CLAIM_GAS_ACTION: SponsorWalletTransactionAction = "utxo-claim-gas";
const DEFAULT_UTXO_CLAIM_GAS_AMOUNT_SYS = "0.001";
const DEFAULT_UTXO_FEE_RATE = 10;
const UTXO_CLAIM_GAS_FEE_BUFFER_SATS = DEFAULT_UTXO_FEE_RATE * 250;
const SPONSOR_RESERVATION_LEASE_MS = 5 * 60_000;
const SPONSOR_PROTOCOL_VERSION = 2;

export class SponsorshipInProgressError extends Error {
  constructor() {
    super("Sponsorship is already in progress");
    this.name = "SponsorshipInProgressError";
  }
}

export class SponsorNonceRecoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SponsorNonceRecoveryError";
  }
}

type SponsorUtxo = {
  txid?: string;
  txId?: string;
  vout: number;
  value: string | number;
};

type SponsorClaimGasResult = {
  funded: boolean;
  status: "skipped" | "pending" | "success" | "failed";
  txid?: string;
  amountSats?: number;
  balanceSats?: number;
  reason?: string;
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

const toSats = (amount: string) => {
  const sats = satoshibitcoin.toSatoshi(amount);
  if (!Number.isFinite(sats) || sats <= 0) {
    throw new Error("Invalid UTXO sponsorship amount");
  }

  return Math.ceil(sats);
};

const isDuplicateKeyError = (error: unknown) => {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number }).code === duplicateKeyCode
  );
};

export class SponsorWalletService {
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
      if (
        action === SUBMIT_PROOFS_ACTION &&
        existingTransaction.sourceTxHash?.toLowerCase() !== normalizedSource
      ) {
        throw new SponsorNonceRecoveryError(
          "Legacy or mismatched signed sponsorship cannot be reused in V2"
        );
      }
      await this.broadcastSponsorTransaction(existingTransaction);
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

  public async sponsorUtxoClaimGas(
    transfer: ITransfer,
    sourceTxHash?: string
  ): Promise<SponsorClaimGasResult> {
    if (transfer.version !== "v2") {
      throw new Error("Foundation sponsorship is only available for V2 transfers");
    }

    if (transfer.type !== "nevm-to-sys") {
      throw new Error("UTXO claim gas sponsorship is only for NEVM to SYS");
    }

    if (!transfer.utxoAddress) {
      throw new Error("Missing UTXO address");
    }

    const preflightStatus = await this.getUtxoClaimGasFundingStatus(
      transfer,
      sourceTxHash
    );
    if (preflightStatus) {
      return preflightStatus;
    }

    const targetAmountSats = this.getUtxoClaimGasAmountSats();
    const sponsorAddress = process.env.UTXO_SPONSOR_ADDRESS;
    const sponsorWif = process.env.UTXO_SPONSOR_WIF;

    if (!sponsorAddress || !sponsorWif) {
      throw new Error("UTXO sponsor wallet is not configured");
    }

    const placeholderResult = await this.createSponsorPlaceholder(
      transfer.id,
      UTXO_CLAIM_GAS_ACTION,
      sponsorAddress,
      sourceTxHash
    );
    let placeholder = placeholderResult.transaction;

    if (placeholder.transaction?.hash) {
      return {
        funded: true,
        status: placeholder.status,
        txid: placeholder.transaction.hash,
      };
    }

    if (!placeholderResult.created && placeholder.status === "pending") {
      return {
        funded: true,
        status: "pending",
        reason: "UTXO claim gas sponsorship is already in progress",
      };
    }

    if (!placeholderResult.created && placeholder.status === "failed") {
      const retryPlaceholder = await this.acquireFailedSponsorPlaceholder(
        transfer.id,
        UTXO_CLAIM_GAS_ACTION,
        sourceTxHash
      );

      if (!retryPlaceholder) {
        return {
          funded: true,
          status: "pending",
          reason: "UTXO claim gas sponsorship is already in progress",
        };
      }

      placeholder = retryPlaceholder;
    }

    let reservation: { key: string; utxo: SponsorUtxo } | undefined;
    let transactionSent = false;
    try {
      reservation = await this.reserveSponsorUtxo(
        sponsorAddress,
        transfer.id,
        targetAmountSats + UTXO_CLAIM_GAS_FEE_BUFFER_SATS
      );
      placeholder = await this.renewSponsorReservation(placeholder);
      const txid = await this.sendUtxoClaimGas(
        sponsorAddress,
        sponsorWif,
        transfer.utxoAddress,
        targetAmountSats,
        reservation.utxo
      );
      transactionSent = true;

      await this.commitUtxoSponsorTransaction(placeholder, txid);
      await this.markSponsorUtxoSpent(reservation.key);

      return {
        funded: true,
        status: "pending",
        txid,
        amountSats: targetAmountSats,
      };
    } catch (error) {
      if (!transactionSent) {
        await this.failSponsorReservation(placeholder);
      }
      throw error;
    } finally {
      if (reservation) {
        await this.releaseSponsorUtxoReservation(reservation.key);
      }
    }
  }

  public async getUtxoClaimGasSponsorStatus(
    transferId: string,
    sourceTxHash?: string
  ): Promise<SponsorClaimGasResult | undefined> {
    const existingTransaction = await SponsorWalletTransactions.findOne({
      action: UTXO_CLAIM_GAS_ACTION,
      $or: [
        { transferId },
        ...(sourceTxHash ? [{ sourceTxHash }] : []),
      ],
    });

    if (existingTransaction?.transaction?.hash) {
      return {
        funded: true,
        status: existingTransaction.status,
        txid: existingTransaction.transaction.hash,
      };
    }

    if (existingTransaction?.status === "pending") {
      const now = new Date();
      const leaseCutoff = new Date(Date.now() - SPONSOR_RESERVATION_LEASE_MS);
      const expired = await SponsorWalletTransactions.findOneAndUpdate(
        {
          _id: existingTransaction._id,
          status: "pending",
          "transaction.hash": { $exists: false },
          $or: [
            { reservationExpiresAt: { $lte: now } },
            {
              reservationExpiresAt: { $exists: false },
              updatedAt: { $lte: leaseCutoff },
            },
          ],
        },
        {
          $set: { status: "failed" },
          $unset: {
            reservationOwner: "",
            reservationExpiresAt: "",
          },
        },
        { new: true }
      );
      if (expired) {
        return undefined;
      }

      return {
        funded: true,
        status: "pending",
        reason: "UTXO claim gas sponsorship is already in progress",
      };
    }

    return undefined;
  }

  public async getUtxoClaimGasFundingStatus(
    transfer: ITransfer,
    sourceTxHash?: string
  ): Promise<SponsorClaimGasResult | undefined> {
    const existingStatus = await this.getUtxoClaimGasSponsorStatus(
      transfer.id,
      sourceTxHash
    );
    if (existingStatus) {
      return existingStatus;
    }

    if (!transfer.utxoAddress) {
      throw new Error("Missing UTXO address");
    }

    const targetAmountSats = this.getUtxoClaimGasAmountSats();
    const addressBalanceSats = await this.getUtxoAddressBalanceSats(
      transfer.utxoAddress
    );

    if (addressBalanceSats >= targetAmountSats) {
      return {
        funded: false,
        status: "skipped",
        amountSats: 0,
        balanceSats: addressBalanceSats,
        reason: "Destination UTXO address already has claim gas",
      };
    }

    if (transfer.utxoXpub) {
      const xpubBalanceSats = await this.getUtxoXpubBalanceSats(
        transfer.utxoXpub
      );

      if (xpubBalanceSats >= targetAmountSats) {
        return {
          funded: false,
          status: "skipped",
          amountSats: 0,
          balanceSats: xpubBalanceSats,
          reason: "Connected UTXO wallet already has claim gas",
        };
      }
    }

    return undefined;
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
      action: UTXO_CLAIM_GAS_ACTION,
    });

    if (!transaction || transaction.status !== "pending") {
      return;
    }

    const rawTransaction = await syscoinUtils
      .fetchBackendRawTx(getUtxoBlockbookUrl(), txid)
      .catch(() => undefined);

    if (!rawTransaction?.txid) {
      return;
    }

    transaction.status = "success";
    transaction.transaction.confirmedHash = rawTransaction.txid;
    await transaction.save();
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
          updatedAt: now,
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
        },
      },
      { new: true }
    );

    if (!committed) {
      throw new SponsorshipInProgressError();
    }

    return committed;
  }

  private async renewSponsorReservation(
    placeholder: ISponsorWalletTransaction
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
          reservationExpiresAt: new Date(
            Date.now() + SPONSOR_RESERVATION_LEASE_MS
          ),
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
        status: "pending",
        reservationOwner: placeholder.reservationOwner,
        "transaction.hash": { $exists: false },
      },
      {
        $set: {
          status: "pending",
          transaction: {
            hash: transactionHash,
            rawData: transactionHash,
            nonce: 0,
            confirmedHash: "",
          },
        },
        $unset: {
          reservationOwner: "",
          reservationExpiresAt: "",
        },
      },
      { new: true }
    );

    if (!committed) {
      throw new SponsorshipInProgressError();
    }

    return committed;
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
        },
      }
    ).catch(() => undefined);
  }

  private async recoverSponsorNonceQueue(walletId: string): Promise<number> {
    let pendingNonce = await web3.eth.getTransactionCount(walletId, "pending");
    const pendingTransactions = await SponsorWalletTransactions.find({
      action: SUBMIT_PROOFS_ACTION,
      walletId,
      status: { $in: ["pending", "failed"] },
      sourceTxHash: { $type: "string" },
      "transaction.rawData": { $type: "string" },
      "transaction.nonce": { $gte: pendingNonce },
    }).sort({ "transaction.nonce": 1 });

    for (const pendingTransaction of pendingTransactions) {
      const storedNonce = pendingTransaction.transaction.nonce;
      if (storedNonce < pendingNonce) {
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
      { $set: { broadcastAt: new Date(), status: "pending" } }
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

  private async getUtxoAddressBalanceSats(address: string): Promise<number> {
    const response = await fetch(
      `${getUtxoBlockbookUrl()}/api/v2/address/${address}?details=basic`
    );

    if (!response.ok) {
      throw new Error("Unable to fetch UTXO address balance");
    }

    const data = (await response.json()) as { balance?: string };
    const balance = Number.parseInt(data.balance ?? "0", 10);

    return Number.isFinite(balance) ? balance : 0;
  }

  private async getUtxoXpubBalanceSats(xpub: string): Promise<number> {
    const response = await fetch(
      `${getUtxoBlockbookUrl()}/api/v2/xpub/${xpub}?details=basic`
    );

    if (!response.ok) {
      throw new Error("Unable to fetch UTXO wallet balance");
    }

    const data = (await response.json()) as { balance?: string };
    const balance = Number.parseInt(data.balance ?? "0", 10);

    return Number.isFinite(balance) ? balance : 0;
  }

  private getUtxoClaimGasAmountSats() {
    return toSats(
      process.env.UTXO_SPONSOR_CLAIM_GAS_AMOUNT_SYS ??
        DEFAULT_UTXO_CLAIM_GAS_AMOUNT_SYS
    );
  }

  private async sendUtxoClaimGas(
    sponsorAddress: string,
    sponsorWif: string,
    recipientAddress: string,
    amountSats: number,
    sponsorUtxo: SponsorUtxo
  ): Promise<string> {
    const syscoinInstance = new syscoin(
      null,
      getUtxoBlockbookUrl(),
      getUtxoNetwork()
    );
    const feeRate = new syscoinUtils.BN(DEFAULT_UTXO_FEE_RATE);
    const txOpts = { rbf: true };

    const result = await syscoinInstance.createTransaction(
      txOpts,
      sponsorAddress,
      [
        {
          address: recipientAddress,
          value: new syscoinUtils.BN(amountSats),
        },
      ],
      feeRate,
      sponsorAddress,
      [sponsorUtxo]
    );

    const signedPsbt = await syscoinInstance.signAndSendWithWIF(
      result.psbt,
      sponsorWif
    );
    const psbt = signedPsbt.psbt ?? signedPsbt;
    const transaction = psbt.extractTransaction();

    return transaction.getId();
  }

  private async reserveSponsorUtxo(
    sponsorAddress: string,
    transferId: string,
    minValueSats: number
  ): Promise<{ key: string; utxo: SponsorUtxo }> {
    const utxos = await this.getSponsorUtxos(sponsorAddress);
    const expiresAt = new Date(Date.now() + SPONSOR_RESERVATION_LEASE_MS);

    for (const utxo of utxos) {
      if (Number(utxo.value) < minValueSats) {
        continue;
      }

      const txid = utxo.txid ?? utxo.txId;
      if (!txid) {
        continue;
      }
      const key = `${txid}:${utxo.vout}`;
      try {
        await SponsorUtxoReservation.create({
          key,
          transferId,
          txid,
          vout: utxo.vout,
          status: "reserved",
          expiresAt,
        });

        return { key, utxo };
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
      }
    }

    throw new Error("No free UTXO sponsor outputs available");
  }

  private async markSponsorUtxoSpent(key: string) {
    await SponsorUtxoReservation.updateOne(
      { key },
      {
        $set: {
          status: "spent",
          expiresAt: new Date(Date.now() + SPONSOR_RESERVATION_LEASE_MS),
        },
      }
    );
  }

  private async releaseSponsorUtxoReservation(key: string) {
    await SponsorUtxoReservation.deleteOne({
      key,
      status: "reserved",
    });
  }

  private async getSponsorUtxos(sponsorAddress: string): Promise<SponsorUtxo[]> {
    const response = await fetch(
      `${getUtxoBlockbookUrl()}/api/v2/utxo/${sponsorAddress}`
    );

    if (!response.ok) {
      throw new Error("Unable to fetch UTXO sponsor outputs");
    }

    const utxos = (await response.json()) as SponsorUtxo[];

    return [...utxos].sort((a, b) => Number(a.value) - Number(b.value));
  }

}

export default SponsorWalletService;
