import firebase from "firebase-setup";
import type { NextApiRequest, NextApiResponse } from "next";
import { doc, getDoc } from "firebase/firestore";
import { signInWithEmailAndPassword } from "firebase/auth";
import { TransferService } from "api/services/transfer";
import dbConnect from "lib/mongodb";

const transferService = new TransferService();

const getRequest = async (req: NextApiRequest, res: NextApiResponse) => {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ message: "Missing id" });
  }

  try {
    const transfer = await transferService.getTransfer(id as string);
    return res.status(200).json(transfer);
  } catch (e) {}

  if (process.env.NODE_ENV !== "development" && firebase.auth) {
    await signInWithEmailAndPassword(
      firebase.auth,
      process.env.FIREBASE_AUTH_EMAIL!,
      process.env.FIREBASE_AUTH_PASSWORD!
    );
  }
  const document = await getDoc(
    doc(firebase.firestore, "transfers", id as string)
  );
  if (!document.exists()) {
    return res.status(404).json({ message: "Transfer not found" });
  }
  res.status(200).json(document.data());
};

const patchRequest = async (req: NextApiRequest, res: NextApiResponse) => {
  const id = req.query.id as string;

  if (!id) {
    return res.status(400).json({ message: "Missing id" });
  }

  try {
    const updated = await transferService.upsertTransfer(req.body);
    res.status(200).json(updated);
  } catch (e) {
    if (e instanceof Error) {
      res.status(500).json({ message: e.message });
    } else {
      res.status(500).json({ message: "Unknown error" });
    }
  }
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  await dbConnect();
  if (req.method === "GET") {
    await getRequest(req, res);
    return;
  }
  if (req.method === "PATCH") {
    await patchRequest(req, res);
    return;
  }
  res.status(405).json({ message: "Invalid method" });
}

export default handler;
