import mongoose from "mongoose";

const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  count: { type: Number, required: true },
  expiresAt: { type: Date, required: true },
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const createModel = () => mongoose.model("TransferCreateQuota", schema);
const model: ReturnType<typeof createModel> = mongoose.models.TransferCreateQuota ?? createModel();

export default model;
