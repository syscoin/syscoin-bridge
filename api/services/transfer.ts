import { ITransfer } from "@contexts/Transfer/types";
import TransferModel from "models/transfer";
import { SponsorWalletService } from "./sponsor-wallet";

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
      throw new Error("Transfer not found");
    }

    return transfer as unknown as ITransfer;
  }

  async upsertTransfer(transfer: ITransfer): Promise<ITransfer> {
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
    const results = await TransferModel.updateOne(
      { id: transfer.id },
      { ...transfer, updatedAt: Date.now() },
      { upsert: true }
    );

    if (!results.acknowledged) {
      throw new Error("Transfer not updated");
    }

    const updatedTransfer = await TransferModel.findOne({ id: transfer.id });

    return updatedTransfer as ITransfer;
  }
}
