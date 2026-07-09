import mongoose from "mongoose";

export interface ISponsorRateLimit extends mongoose.Document {
  key: string;
  count: number;
  resetAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SponsorRateLimitSchema = new mongoose.Schema<ISponsorRateLimit>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
    },
    count: {
      type: Number,
      required: true,
      default: 0,
    },
    resetAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

SponsorRateLimitSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });

const generateModel = () =>
  mongoose.model("SponsorRateLimit", SponsorRateLimitSchema);

let model: ReturnType<typeof generateModel> = mongoose.models.SponsorRateLimit;

if (!model) {
  model = generateModel();
}

export default model;
