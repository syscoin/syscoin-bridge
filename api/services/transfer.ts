import { ITransfer } from "@contexts/Transfer/types";
import { UserCredential, signInWithEmailAndPassword } from "firebase/auth";
import firebase from "firebase-setup";
import { doc, getDoc } from "firebase/firestore";

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
  async getTransfer(id: string): Promise<ITransfer> {
    await this.authenticate();
    const document = await getDoc(
      doc(firebase.firestore, "transfers", id as string)
    );
    if (!document.exists()) {
      throw new Error("Transfer not found");
    }

    return document.data() as ITransfer;
  }
}
