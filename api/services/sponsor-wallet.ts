import { ITransfer } from "@contexts/Transfer/types";
import { createHash } from "crypto";
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
  const preimage = Buffer.from(hex, "hex");
  const hash = createHash("sha256")
    .update(createHash("sha256").update(preimage).digest())
    .digest();
  return Buffer.from(hash).reverse().toString("hex");
}

const SUBMIT_PROOFS_ACTION: SponsorWalletTransactionAction = "submit-proofs";
const UTXO_CLAIM_GAS_ACTION: SponsorWalletTransactionAction = "utxo-claim-gas";
const DEFAULT_UTXO_CLAIM_GAS_AMOUNT_SYS = "0.001";
const DEFAULT_UTXO_FEE_RATE = 10;
const UTXO_CLAIM_GAS_FEE_BUFFER_SATS = DEFAULT_UTXO_FEE_RATE * 250;
const UTXO_RESERVATION_LEASE_MS = 5 * 60_000;

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

const getDocumentUpdatedAtMs = (document: unknown) => {
  const updatedAt = (document as { updatedAt?: Date | string | number })
    .updatedAt;

  if (!updatedAt) {
    return undefined;
  }

  return new Date(updatedAt).getTime();
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

    const existingTransaction = await SponsorWalletTransactions.findOne({
      action,
      $or: [
        { transferId },
        ...(normalizedSource ? [{ sourceTxHash: normalizedSource }] : []),
      ],
    });

    if (existingTransaction?.transaction?.hash) {
      return existingTransaction;
    }

    if (
      existingTransaction?.status === "pending" &&
      !existingTransaction.transaction?.hash
    ) {
      return existingTransaction;
    }

    const privateKey = process.env.NEVM_SPONSOR_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("NEVM sponsor wallet is not configured");
    }

    const sender = web3.eth.accounts.privateKeyToAccount(privateKey);

    // Reserve (transferId, action) and (action, sourceTxHash) before nonce /
    // estimate / sign so concurrent aliases of the same burn cannot each mint
    // a sponsor signature.
    const placeholderResult = await this.createSponsorPlaceholder(
      transferId,
      action,
      sender.address,
      normalizedSource
    );
    let placeholder = placeholderResult.transaction;

    if (placeholder.transaction?.hash) {
      return placeholder;
    }

    if (!placeholderResult.created && placeholder.status === "pending") {
      return placeholder;
    }

    if (!placeholderResult.created && placeholder.status === "failed") {
      const retryPlaceholder = await this.acquireFailedSponsorPlaceholder(
        transferId,
        action,
        normalizedSource
      );
      if (!retryPlaceholder) {
        const inFlight = await SponsorWalletTransactions.findOne({
          action,
          $or: [
            { transferId },
            ...(normalizedSource ? [{ sourceTxHash: normalizedSource }] : []),
          ],
        });
        if (inFlight) {
          return inFlight;
        }
        throw new Error("Sponsorship reservation conflict");
      }
      placeholder = retryPlaceholder;
    }

    try {
      const nonce = await this.getAddressNextNonce(sender.address);
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

      placeholder.transaction = {
        hash: signedTransaction.transactionHash,
        rawData: signedTransaction.rawTransaction,
        nonce,
        confirmedHash: "",
      };
      placeholder.status = "pending";
      if (normalizedSource) {
        placeholder.sourceTxHash = normalizedSource;
      }
      await placeholder.save();
      return placeholder;
    } catch (error) {
      placeholder.status = "failed";
      await placeholder.save().catch(() => undefined);
      throw error;
    }
  }

  public async sponsorUtxoClaimGas(
    transfer: ITransfer,
    sourceTxHash?: string
  ): Promise<SponsorClaimGasResult> {
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
    try {
      reservation = await this.reserveSponsorUtxo(
        sponsorAddress,
        transfer.id,
        targetAmountSats + UTXO_CLAIM_GAS_FEE_BUFFER_SATS
      );
      const txid = await this.sendUtxoClaimGas(
        sponsorAddress,
        sponsorWif,
        transfer.utxoAddress,
        targetAmountSats,
        reservation.utxo
      );

      placeholder.transaction = {
        hash: txid,
        rawData: txid,
        nonce: 0,
        confirmedHash: "",
      };
      placeholder.status = "pending";
      await placeholder.save();
      await this.markSponsorUtxoSpent(reservation.key);

      return {
        funded: true,
        status: "pending",
        txid,
        amountSats: targetAmountSats,
      };
    } catch (error) {
      placeholder.status = "failed";
      await placeholder.save();
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
      const updatedAtMs = getDocumentUpdatedAtMs(existingTransaction);
      if (
        updatedAtMs !== undefined &&
        Date.now() - updatedAtMs > UTXO_RESERVATION_LEASE_MS
      ) {
        existingTransaction.status = "failed";
        await existingTransaction.save();
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
    const placeholder = new SponsorWalletTransactions({
      transferId,
      action,
      sourceTxHash,
      walletId,
      status: "pending",
      transaction: {},
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
        },
      },
      { new: true }
    );
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
    const expiresAt = new Date(Date.now() + UTXO_RESERVATION_LEASE_MS);

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
          expiresAt: new Date(Date.now() + UTXO_RESERVATION_LEASE_MS),
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

  private async getAddressNextNonce(address: string): Promise<number> {
    const [lastTransaction] = await SponsorWalletTransactions.find({
      walletId: address,
    }).sort({ "transaction.nonce": -1 }).limit(1);

    const pendingNonce = await web3.eth.getTransactionCount(address, "pending");

    const internalNonce = lastTransaction
      ? lastTransaction.transaction.nonce
      : -1;

    return pendingNonce > internalNonce ? pendingNonce : internalNonce + 1;
  }
}

export default SponsorWalletService;
