import mongoose from "mongoose";

export type SponsorWalletTransactionStatus = "pending" | "success" | "failed";

export interface ISponsorWalletTransaction extends mongoose.Document {
  transferId: string
  walletId: string;
  transactionHash: string;
  status: SponsorWalletTransactionStatus;
  createdAt: Date;
  updatedAt: Date;
}

const SponsorWalletTransactionSchema =
  new mongoose.Schema<ISponsorWalletTransaction>(
    {
      transferId: {
        type: String
      },
      walletId: {
        type: String,
      },
      transactionHash: {
        type: String,
      },
      status: {
        type: String,
        default: "pending",
      },
    },
    { timestamps: true }
  );

const generateModel = () =>
  mongoose.model("SponsorWalletTransaction", SponsorWalletTransactionSchema);

let model: ReturnType<typeof generateModel> = mongoose.models.SponsorWalletTransaction;

if (!model) {
  model = generateModel();
}

export default model;
