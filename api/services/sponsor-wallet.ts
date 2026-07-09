import { DEFAULT_GAS_LIMIT } from "@constants";
import { ITransfer } from "@contexts/Transfer/types";
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

const SUBMIT_PROOFS_ACTION: SponsorWalletTransactionAction = "submit-proofs";
const UTXO_CLAIM_GAS_ACTION: SponsorWalletTransactionAction = "utxo-claim-gas";
const DEFAULT_UTXO_CLAIM_GAS_AMOUNT_SYS = "0.001";
const DEFAULT_UTXO_FEE_RATE = 10;
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
    action: SponsorWalletTransactionAction = SUBMIT_PROOFS_ACTION
  ): Promise<ISponsorWalletTransaction> {
    const existingTransaction = await SponsorWalletTransactions.findOne({
      transferId: transferId,
      $or: [{ action }, { action: { $exists: false } }],
    });

    if (existingTransaction) {
      return existingTransaction;
    }

    const privateKey = process.env.NEVM_SPONSOR_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("NEVM sponsor wallet is not configured");
    }

    const sender = web3.eth.accounts.privateKeyToAccount(privateKey);
    const nonce = await this.getAddressNextNonce(sender.address);

    const gasPrice = await web3.eth.getGasPrice();
    const gas = await web3.eth
      .estimateGas({ ...transactionConfig, from: sender.address })
      .catch((e) => {
        console.error("estimateGas error", e);
        return DEFAULT_GAS_LIMIT;
      });

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

    let walletTransaction = new SponsorWalletTransactions({
      transferId: transferId,
      action,
      walletId: sender.address,
      transaction: {
        hash: signedTransaction.transactionHash,
        rawData: signedTransaction.rawTransaction,
        nonce: nonce,
      },
      status: "pending",
    });

    return walletTransaction.save().catch(async (error) => {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      const duplicate = await SponsorWalletTransactions.findOne({
        transferId,
        $or: [{ action }, { action: { $exists: false } }],
      });
      if (!duplicate) {
        throw error;
      }

      return duplicate;
    });
  }

  public async sponsorUtxoClaimGas(
    transfer: ITransfer
  ): Promise<SponsorClaimGasResult> {
    if (transfer.type !== "nevm-to-sys") {
      throw new Error("UTXO claim gas sponsorship is only for NEVM to SYS");
    }

    if (!transfer.utxoAddress) {
      throw new Error("Missing UTXO address");
    }

    const existingTransaction = await SponsorWalletTransactions.findOne({
      transferId: transfer.id,
      action: UTXO_CLAIM_GAS_ACTION,
    });

    if (existingTransaction?.transaction?.hash) {
      return {
        funded: true,
        status: existingTransaction.status,
        txid: existingTransaction.transaction.hash,
      };
    }

    if (existingTransaction?.status === "pending") {
      return {
        funded: true,
        status: "pending",
        reason: "UTXO claim gas sponsorship is already in progress",
      };
    }

    const targetAmountSats = toSats(
      process.env.UTXO_SPONSOR_CLAIM_GAS_AMOUNT_SYS ??
        DEFAULT_UTXO_CLAIM_GAS_AMOUNT_SYS
    );
    const balanceSats = await this.getUtxoAddressBalanceSats(
      transfer.utxoAddress
    );

    if (balanceSats >= targetAmountSats) {
      return {
        funded: false,
        status: "skipped",
        amountSats: 0,
        balanceSats,
        reason: "Destination UTXO address already has claim gas",
      };
    }

    const sponsorAddress = process.env.UTXO_SPONSOR_ADDRESS;
    const sponsorWif = process.env.UTXO_SPONSOR_WIF;

    if (!sponsorAddress || !sponsorWif) {
      throw new Error("UTXO sponsor wallet is not configured");
    }

    const placeholder = await this.createSponsorPlaceholder(
      transfer.id,
      UTXO_CLAIM_GAS_ACTION,
      sponsorAddress
    );

    if (placeholder.transaction?.hash) {
      return {
        funded: true,
        status: placeholder.status,
        txid: placeholder.transaction.hash,
      };
    }

    let reservation: { key: string; utxo: SponsorUtxo } | undefined;
    try {
      reservation = await this.reserveSponsorUtxo(sponsorAddress, transfer.id);
      const txid = await this.sendUtxoClaimGas(
        sponsorAddress,
        sponsorWif,
        transfer.utxoAddress,
        targetAmountSats,
        reservation.utxo
      );
      await this.markSponsorUtxoSpent(reservation.key);

      placeholder.transaction = {
        hash: txid,
        rawData: txid,
        nonce: 0,
        confirmedHash: "",
      };
      placeholder.status = "pending";
      await placeholder.save();

      return {
        funded: true,
        status: "pending",
        txid,
        amountSats: targetAmountSats,
        balanceSats,
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
    walletId: string
  ): Promise<ISponsorWalletTransaction> {
    const placeholder = new SponsorWalletTransactions({
      transferId,
      action,
      walletId,
      status: "pending",
      transaction: {},
    });

    return placeholder.save().catch(async (error) => {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      const duplicate = await SponsorWalletTransactions.findOne({
        transferId,
        action,
      });
      if (!duplicate) {
        throw error;
      }

      return duplicate;
    });
  }

  private async getUtxoAddressBalanceSats(address: string): Promise<number> {
    const response = await fetch(`${getUtxoBlockbookUrl()}/api/v2/address/${address}`);

    if (!response.ok) {
      throw new Error("Unable to fetch UTXO address balance");
    }

    const data = (await response.json()) as { balance?: string };
    const balance = Number.parseInt(data.balance ?? "0", 10);

    return Number.isFinite(balance) ? balance : 0;
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
    transferId: string
  ): Promise<{ key: string; utxo: SponsorUtxo }> {
    const utxos = await this.getSponsorUtxos(sponsorAddress);
    const expiresAt = new Date(Date.now() + UTXO_RESERVATION_LEASE_MS);

    for (const utxo of utxos) {
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
