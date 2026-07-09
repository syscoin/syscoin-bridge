import { NextApiHandler } from "next";
import adminSessionGuard from "utils/api/admin-session-guard";
import dbConnect from "lib/mongodb";
import TransferModel from "models/transfer";
import { ITransfer } from "@contexts/Transfer/types";

const AdminTransferDetailHandler: NextApiHandler = adminSessionGuard(
  async (req, res) => {
    if (req.method !== "GET") {
      return res.status(405).json({ message: "Method not allowed" });
    }

    const { id } = req.query;

    if (!id || typeof id !== "string") {
      return res.status(400).json({ message: "Missing transfer id" });
    }

    await dbConnect();

    const transfer = (await TransferModel.findOne({ id })) as ITransfer | null;

    if (!transfer) {
      return res.status(404).json({ message: "Transfer not found" });
    }

    return res.status(200).json(transfer);
  }
);

export default AdminTransferDetailHandler;
