import { DEFAULT_GAS_LIMIT } from "@constants";
import SponsorWallet, { ISponsorWallet } from "models/sponsor-wallet";
import SponsorWalletTransactions, {
  ISponsorWalletTransaction,
  SponsorWalletTransactionCollectionName,
} from "models/sponsor-wallet-transactions";
import web3 from "utils/get-web3";
import { TransactionConfig } from "web3-core";

export class SponsorWalletService {
  public async createSponsorWallet(privateKey: string) {
    const account = web3.eth.accounts.privateKeyToAccount(privateKey);

    const balanceInWei = await web3.eth.getBalance(account.address);

    const balanceEth = web3.utils.fromWei(balanceInWei, "ether");

    if (Number(balanceEth) < 0.01) {
      throw new Error(`${account.address} Balance is less than 0.01`);
    }

    const wallet = new SponsorWallet({
      address: account.address,
      privateKey,
    });
    await wallet.save();
    return wallet.toObject();
  }

  public async sponsorTransaction(
    transferId: string,
    transactionConfig: Omit<TransactionConfig, "nonce">
  ): Promise<ISponsorWalletTransaction> {
    const wallet = await this.getAvailableWalletForSigning();

    if (!wallet) {
      throw new Error("No Sponsor Wallet available");
    }

    const existingTransaction = await SponsorWalletTransactions.findOne({
      transferId: transferId,
    });

    if (existingTransaction) {
      return existingTransaction;
    }

    const nonce = await this.getWalletNextNonce(wallet._id);

    const sender = web3.eth.accounts.privateKeyToAccount(wallet.privateKey);

    const gasPrice = await web3.eth.getGasPrice();
    const gas = await web3.eth.estimateGas(transactionConfig).catch((e) => {
      console.error("estimateGas error", e);
      return DEFAULT_GAS_LIMIT;
    });

    const signedTransaction = await sender.signTransaction({
      ...transactionConfig,
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
      walletId: wallet._id,
      transaction: {
        hash: signedTransaction.transactionHash,
        rawData: signedTransaction.rawTransaction,
        nonce: nonce,
      },
      status: "pending",
    });

    return walletTransaction.save();
  }

  public async updateSponsorWalletTransactionStatus(transactionHash: string) {
    const transaction = await SponsorWalletTransactions.findOne({
      transactionHash,
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

  private async getWalletNextNonce(walletId: string): Promise<number> {
    const wallet = await SponsorWallet.findById(walletId);
    if (!wallet) {
      throw new Error("Wallet not found");
    }
    const [lastTransaction] = await SponsorWalletTransactions.find({
      walletId: wallet?.id,
    }).sort({ "transaction.nonce": -1 }).limit(1);

    const pendingNonce = await web3.eth.getTransactionCount(
      wallet.address,
      "pending"
    );

    console.log("pendingNonce", pendingNonce);
    console.log("lastTransaction nonce", lastTransaction?.transaction.nonce);

    const internalNonce = lastTransaction
      ? lastTransaction.transaction.nonce
      : -1;

    return pendingNonce > internalNonce ? pendingNonce : internalNonce + 1;
  }

  private async getAvailableWalletForSigning(): Promise<ISponsorWallet> {
    const walletWithNoPendingTransactions =
      await this.getWalletWithNoPendingTransactions();

    if (walletWithNoPendingTransactions.length > 0) {
      return walletWithNoPendingTransactions[0];
    }

    const walletWithLeastPendingTransactions =
      await this.getWalletWithLeastPendingTransactions();

    return walletWithLeastPendingTransactions;
  }

  private getWalletWithNoPendingTransactions(): Promise<ISponsorWallet[]> {
    return SponsorWallet.aggregate([
      {
        $lookup: {
          from: SponsorWalletTransactionCollectionName,
          localField: "_id",
          foreignField: "walletId",
          as: "transactions",
        },
      },
      {
        $match: {
          "transactions.status": {
            $ne: "pending",
          },
        },
      },
    ]);
  }

  private getWalletWithLeastPendingTransactions(): Promise<ISponsorWallet> {
    return SponsorWallet.aggregate([
      {
        $lookup: {
          from: SponsorWalletTransactionCollectionName,
          localField: "_id",
          foreignField: "walletId",
          as: "transactions",
        },
      },
      {
        $match: {
          "transactions.status": "pending",
        },
      },
      {
        $project: {
          id: "$_id",
          address: 1,
          privateKey: 1,
          pendingTransactionCount: {
            $size: "$transactions",
          },
        },
      },
      {
        $sort: {
          pendingTransactionCount: 1,
        },
      },
      {
        $limit: 1,
      },
    ]).then((wallets) => wallets[0]);
  }
}

export default SponsorWalletService;
