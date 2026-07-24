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
  sourceTxHash?: string;
  sponsorProtocolVersion?: number;
  walletId: string;
  status: SponsorWalletTransactionStatus;
  reservationOwner?: string;
  reservationExpiresAt?: Date;
  broadcastAt?: Date;
  broadcastAttempts?: number;
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
      sourceTxHash: {
        type: String,
      },
      sponsorProtocolVersion: {
        type: Number,
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
      reservationOwner: {
        type: String,
      },
      reservationExpiresAt: {
        type: Date,
      },
      broadcastAt: {
        type: Date,
      },
      broadcastAttempts: {
        type: Number,
        default: 0,
      },
    },
    { timestamps: true }
  );

SponsorWalletTransactionSchema.index(
  { transferId: 1, action: 1 },
  { unique: true }
);
// One sponsorship per (action, source chain tx). Required for submit-proofs so
// the same burn cannot be sponsored under many transferId aliases.
// Named explicitly; ensureSponsorIndexes drops prior same-key variants.
SponsorWalletTransactionSchema.index(
  { action: 1, sourceTxHash: 1 },
  {
    name: "action_1_sourceTxHash_1_v2",
    unique: true,
    partialFilterExpression: {
      sourceTxHash: { $type: "string" },
    },
  }
);
// Serialize NEVM sponsor nonce commits across concurrent API workers. A raw
// transaction must be durable under this index before the server broadcasts it.
SponsorWalletTransactionSchema.index(
  { walletId: 1, "transaction.nonce": 1 },
  {
    name: "walletId_1_transaction_nonce_1_submit_proofs_v2",
    unique: true,
    partialFilterExpression: {
      action: "submit-proofs",
      sponsorProtocolVersion: 2,
      walletId: { $type: "string" },
      "transaction.nonce": { $type: "number" },
    },
  }
);

const generateModel = () =>
  mongoose.model("SponsorWalletTransaction", SponsorWalletTransactionSchema);

let model: ReturnType<typeof generateModel> =
  mongoose.models.SponsorWalletTransaction;

if (!model) {
  model = generateModel();
}

export default model;
