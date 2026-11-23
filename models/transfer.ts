import { ITransfer, ITransferLog } from "@contexts/Transfer/types";
import mongoose from "mongoose";
import type { TransferHistoryEvidence } from "api/services/transfer-progress";

export type Transfer = mongoose.Document &
  ITransfer & {
    writeTokenHash?: string;
    progressStatus?: ITransfer["status"];
    historyEvidence?: TransferHistoryEvidence;
  };

const TransferLogSchema = new mongoose.Schema<ITransferLog>({
  date: {
    type: Number,
  },
  status: {
    type: String,
  },
  payload: {
    type: Object,
  },
});

const TransferHistoryEvidenceSchema = new mongoose.Schema<TransferHistoryEvidence>({
  sourceTransactionHash: { type: String, required: true },
  nevmAddress: { type: String, required: true },
  utxoAddresses: { type: [String], required: true },
  utxoAccountHash: String,
}, { _id: false });

const TransferSchema = new mongoose.Schema<Transfer>({
  id: {
    type: String,
    required: true,
    unique: true,
  },
  type: {
    type: String,
  },
  status: {
    type: String,
  },
  logs: [TransferLogSchema],
  createdAt: {
    type: Number,
  },
  updatedAt: {
    type: Number,
  },
  utxoAddress: {
    type: String,
  },
  utxoXpub: {
    type: String,
  },
  nevmAddress: {
    type: String,
  },
  version: {
    type: String,
    required: true,
    enum: ["v1", "v2"],
  },
  amount: {
    type: String,
  },
  agreedToTerms: {
    type: Boolean,
  },
  useSysx: {
    type: Boolean,
  },
  utxoAssetType: {
    type: String,
  },
  writeTokenHash: {
    type: String,
    select: false,
  },
  progressStatus: {
    type: String,
    select: false,
  },
  historyEvidence: {
    type: TransferHistoryEvidenceSchema,
    select: false,
  },
});

for (const key of ["nevmAddress", "utxoAddresses", "utxoAccountHash"] as const) {
  const path = `historyEvidence.${key}`;
  TransferSchema.index({ [path]: 1, createdAt: -1, _id: -1 }, {
    partialFilterExpression: { [path]: { $exists: true } },
  });
}

const generateModel = () => mongoose.model("Transfer", TransferSchema);

let model: ReturnType<typeof generateModel> = mongoose.models.Transfer;

if (!model) {
  model = generateModel();
}

export default model;
