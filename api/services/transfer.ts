import { ITransfer } from "@contexts/Transfer/types";
import { UserCredential, signInWithEmailAndPassword } from "firebase/auth";
import firebase from "firebase-setup";
import { doc, getDoc } from "firebase/firestore";
import dbConnect from "lib/mongodb";
import TransferModel from "models/transfer";

export class TransferService {
  private isAuthenticated = false;
  constructor() {
    this.authenticate();
  }
  private async authenticate() {
    if (this.isAuthenticated) {
      return;
    }
    if (process.env.NODE_ENV !== "development" && firebase.auth) {
      await signInWithEmailAndPassword(
        firebase.auth,
        process.env.FIREBASE_AUTH_EMAIL!,
        process.env.FIREBASE_AUTH_PASSWORD!
      ).then((userCredential) => {
        this.isAuthenticated = Boolean(userCredential as UserCredential);
      });
    }
  }

  async getAll(params: Partial<ITransfer>): Promise<ITransfer[]> {
    const filters: (keyof ITransfer)[] = [
      "nevmAddress",
      "utxoAddress",
      "utxoXpub",
    ];
    const queryConstraints = filters.reduce((acc, key) => {
      if (key in params && typeof params[key] === "string") {
        acc.push({ [key]: params[key] as string });
      }
      return acc;
    }, [] as Record<string, string>[]);
    return TransferModel.find({
      $or: queryConstraints,
    });
  }

  async getTransfer(id: string): Promise<ITransfer> {
    const transfer = await TransferModel.findOne({ id });

    if (!transfer) {
      return this.getTransferFirebase(id);
    }

    return transfer as unknown as ITransfer;
  }

  async getTransferFirebase(id: string): Promise<ITransfer> {
    await this.authenticate();
    const document = await getDoc(
      doc(firebase.firestore, "transfers", id as string)
    );

    if (!document.exists()) {
      throw new Error("Transfer not found");
    }

    const transferData = document.data() as ITransfer;

    return this.upsertTransfer(transferData);
  }

  async upsertTransfer(transfer: ITransfer): Promise<ITransfer> {
    const results = await TransferModel.updateOne(
      { id: transfer.id },
      { ...transfer, updatedAt: Date.now() },
      { upsert: true }
    );

    if (!results.acknowledged) {
      throw new Error("Transfer not updated");
    }

    const updatedTransfer = await TransferModel.findOne({ id: transfer.id });

    return updatedTransfer as ITransfer;
  }
}
