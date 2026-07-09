import mongoose from "mongoose";

export type SponsorWalletTransactionStatus = "pending" | "success" | "failed";
export type SponsorWalletTransactionAction =
  | "submit-proofs"
  | "utxo-claim-gas";

export const SponsorWalletTransactionCollectionName =
  "sponsorwallettransactions";

export interface ISponsorWalletTransaction extends mongoose.Document {
  transferId: string;
  action: SponsorWalletTransactionAction;
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
        required: true,
      },
      action: {
        type: String,
        required: true,
        default: "submit-proofs",
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

SponsorWalletTransactionSchema.index(
  { transferId: 1, action: 1 },
  { unique: true }
);

const generateModel = () =>
  mongoose.model("SponsorWalletTransaction", SponsorWalletTransactionSchema);

let model: ReturnType<typeof generateModel> =
  mongoose.models.SponsorWalletTransaction;

if (!model) {
  model = generateModel();
}

export default model;
