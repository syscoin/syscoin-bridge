import { NextApiHandler } from "next";
import { TransferService } from "api/services/transfer";
import dbConnect from "lib/mongodb";
import { ITransfer } from "@contexts/Transfer/types";
import { applyApiCors } from "utils/api/cors";

const transferService = new TransferService();

const getAll: NextApiHandler = async (req, res) => {
  const { nevm, utxo, version } = req.query;

  await dbConnect();

  const dbTransfer = await transferService.getAll({
    nevmAddress: nevm as string,
    utxoAddress: utxo as string,
    utxoXpub: utxo as string,
    version: version as ITransfer["version"],
  });

  return res.status(200).json(Object.values(dbTransfer));
};

const handler: NextApiHandler = async (req, res) => {
  if (applyApiCors(req, res)) {
    return;
  }

  if (req.method === "GET") {
    await getAll(req, res);
    return;
  }

  return res.status(405).json({ message: "Method not allowed" });
};

export default handler;
