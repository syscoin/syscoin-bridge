import { NextApiHandler } from "next";
import adminSessionGuard from "utils/api/admin-session-guard";
import dbConnect from "lib/mongodb";
import TransferModel from "models/transfer";
import { FilterQuery } from "mongoose";
import { ITransfer } from "@contexts/Transfer/types";

const PAGE_SIZE = 10;

const AdminTransfersHandler: NextApiHandler = adminSessionGuard(
  async (req, res) => {
    if (req.method !== "GET") {
      return res.status(405).json({ message: "Method not allowed" });
    }

    await dbConnect();

    const { id, page } = req.query;
    const filters: FilterQuery<ITransfer> = {};

    if (typeof id === "string" && id.trim().length > 0) {
      filters.id = id;
    }

    const currentPage = Number(page) || 0;

    const transfers = await TransferModel.find(filters)
      .sort({ createdAt: -1 })
      .skip(currentPage * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean();

    const total = await TransferModel.countDocuments();

    return res.status(200).json({
      transfers,
      total,
      pageSize: PAGE_SIZE,
    });
  }
);

export default AdminTransfersHandler;
