import mongoose from "mongoose";

export type SponsorWalletTransactionStatus = "pending" | "success" | "failed";

export const SponsorWalletTransactionCollectionName = 'sponsorwallettransactions'

export interface ISponsorWalletTransaction extends mongoose.Document {
  transferId: string;
  walletId: string;
  status: SponsorWalletTransactionStatus;
  createdAt: Date;
  updatedAt: Date;
  transaction: {
    hash: string;
    rawData: string;
    confirmedHash: string;
    nonce: number;
  };
}

const SponsorWalletTransactionSchema =
  new mongoose.Schema<ISponsorWalletTransaction>(
    {
      transferId: {
        type: String,
      },
      walletId: {
        type: String,
      },
      status: {
        type: String,
        default: "pending",
      },
      transaction: {
        type: Object,
        default: {},
      },
    },
    { timestamps: true }
  );

const generateModel = () =>
  mongoose.model("SponsorWalletTransaction", SponsorWalletTransactionSchema);

let model: ReturnType<typeof generateModel> =
  mongoose.models.SponsorWalletTransaction;

if (!model) {
  model = generateModel();
}

export default model;
