import mongoose from "mongoose";
export interface ISponsorWallet extends mongoose.Document {
  address: string;
  privateKey: string;
  createdAt: Date;
  updatedAt: Date;
}

const SponsorWalletSchema = new mongoose.Schema<ISponsorWallet>({
  address: {
    type: String,
    required: true,
    unique: true,
  },
  privateKey: {
    type: String,
    required: true,
    unique: true,
  },
});

SponsorWalletSchema.set("timestamps", true);

const generateModel = () =>
  mongoose.model("SponsorWallet", SponsorWalletSchema);

let model: ReturnType<typeof generateModel> = mongoose.models.SponsorWallet;

if (!model) {
  model = generateModel();
}

export default model;
