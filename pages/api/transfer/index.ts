import { NextApiHandler } from "next";
import { TransferService } from "api/services/transfer";
import dbConnect from "lib/mongodb";
import { ITransfer } from "@contexts/Transfer/types";

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

const handler: NextApiHandler = (req, res) => {
  if (req.method === "GET") {
    getAll(req, res);
  }
};

export default handler;
