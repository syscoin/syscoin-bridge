import { NextApiHandler } from "next";
import firebase from "firebase-setup";
import {
  QueryConstraint,
  collection,
  getDocs,
  orderBy,
  query,
  where,
  or,
  QueryFilterConstraint,
} from "firebase/firestore";
import { signInWithEmailAndPassword } from "firebase/auth";
import { TransferService } from "api/services/transfer";
import dbConnect from "lib/mongodb";

const transferService = new TransferService();

const getAll: NextApiHandler = async (req, res) => {
  const { nevm, utxo, version } = req.query;

  if (process.env.NODE_ENV !== "development" && firebase.auth) {
    await signInWithEmailAndPassword(
      firebase.auth,
      process.env.FIREBASE_AUTH_EMAIL!,
      process.env.FIREBASE_AUTH_PASSWORD!
    );
  }
  const queryConstraints: QueryFilterConstraint[] = [];

  if (nevm) {
    queryConstraints.push(where("nevmAddress", "==", nevm));
  }

  if (utxo) {
    queryConstraints.push(where("utxoXpub", "==", utxo));
    queryConstraints.push(where("utxoAddress", "==", utxo));
  }

  if (queryConstraints.length === 0) {
    return res.status(400).json({ message: "Some parameters are missing" });
  }

  const transferQuery = query(
    collection(firebase.firestore, "transfers"),
    or(...queryConstraints),
    orderBy("createdAt", "desc")
  );

  const { docs } = await getDocs(transferQuery);
  let transfers = docs.map((doc) => doc.data());
  await dbConnect();
  let dbTransfer = await transferService.getAll({
    nevmAddress: nevm as string,
    utxoAddress: utxo as string,
    utxoXpub: utxo as string,
  });
  transfers = [...transfers, ...dbTransfer];
  if (version) {
    transfers = transfers.filter((transfer) => transfer.version === version);
  }
  return res.status(200).json(Object.values(transfers));
};

const handler: NextApiHandler = (req, res) => {
  if (req.method === "GET") {
    getAll(req, res);
  }
};

export default handler;
