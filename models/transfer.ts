import { ITransfer, ITransferLog } from "@contexts/Transfer/types";
import mongoose from "mongoose";

export type Transfer = mongoose.Document & ITransfer;

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
  },
  amount: {
    type: String,
  },
});

export default mongoose.models.Transfer ||
  mongoose.model("Transfer", TransferSchema);