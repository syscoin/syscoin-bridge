import { NextApiHandler } from "next";
import firebase from "firebase-setup";
import {
  QueryConstraint,
  collection,
  getDocs,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { signInWithEmailAndPassword } from "firebase/auth";

const getAll: NextApiHandler = async (req, res) => {
  const { nevm, utxo } = req.query;

  if (process.env.NODE_ENV !== "development" && firebase.auth) {
    await signInWithEmailAndPassword(
      firebase.auth,
      process.env.FIREBASE_AUTH_EMAIL!,
      process.env.FIREBASE_AUTH_PASSWORD!
    );
  }
  const queryConstraints: QueryConstraint[] = [];

  if (nevm) {
    queryConstraints.push(where("nevmAddress", "==", nevm));
  }

  if (utxo) {
    queryConstraints.push(where("utxoXpub", "==", utxo));
  }

  if (queryConstraints.length === 0) {
    return res.status(400).json({ message: "Some parameters are missing" });
  }

  const transferQuery = query(
    collection(firebase.firestore, "transfers"),
    ...queryConstraints,
    orderBy("createdAt", "desc")
  );

  const { docs } = await getDocs(transferQuery);

  return res.status(200).json(Object.values(docs.map((doc) => doc.data())));
};

const handler: NextApiHandler = (req, res) => {
  if (req.method === "GET") {
    getAll(req, res);
  }
};

export default handler;
