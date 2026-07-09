import mongoose from "mongoose";

export type SponsorUtxoReservationStatus = "reserved" | "spent" | "released";

export interface ISponsorUtxoReservation extends mongoose.Document {
  key: string;
  transferId: string;
  txid: string;
  vout: number;
  status: SponsorUtxoReservationStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SponsorUtxoReservationSchema =
  new mongoose.Schema<ISponsorUtxoReservation>(
    {
      key: {
        type: String,
        required: true,
        unique: true,
      },
      transferId: {
        type: String,
        required: true,
      },
      txid: {
        type: String,
        required: true,
      },
      vout: {
        type: Number,
        required: true,
      },
      status: {
        type: String,
        required: true,
        default: "reserved",
      },
      expiresAt: {
        type: Date,
        required: true,
      },
    },
    { timestamps: true }
  );

SponsorUtxoReservationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
SponsorUtxoReservationSchema.index({ transferId: 1, status: 1 });

const generateModel = () =>
  mongoose.model("SponsorUtxoReservation", SponsorUtxoReservationSchema);

let model: ReturnType<typeof generateModel> =
  mongoose.models.SponsorUtxoReservation;

if (!model) {
  model = generateModel();
}

export default model;
