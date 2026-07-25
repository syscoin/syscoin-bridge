import { ITransfer, ITransferLog } from "@contexts/Transfer/types";
import mongoose from "mongoose";

export type Transfer = mongoose.Document &
  ITransfer & {
    writeTokenHash?: string;
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
});

const generateModel = () => mongoose.model("Transfer", TransferSchema);

let model: ReturnType<typeof generateModel> = mongoose.models.Transfer;

if (!model) {
  model = generateModel();
}

export default model;
