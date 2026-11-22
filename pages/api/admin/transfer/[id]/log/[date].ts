import dbConnect from "lib/mongodb";
import { NextApiHandler } from "next";
import adminSessionGuard from "utils/api/admin-session-guard";
import TransferModel from "models/transfer";
import { getAdminOrigin, isAdminTransferId } from "utils/api/admin-authorization";

const AdminTransferLog: NextApiHandler = adminSessionGuard(async (req, res) => {
  if (req.method === "DELETE") {
    if (!getAdminOrigin(req)) {
      return res.status(403).json({ message: "Origin required" });
    }
    const { id, date } = req.query;
    if (!isAdminTransferId(id) || typeof date !== "string" || !/^\d{1,16}$/.test(date)) {
      return res.status(400).json({ message: "Invalid transfer ID or log date" });
    }

    await dbConnect();
    const deleteResults = await TransferModel.updateMany(
      { id },
      {
        // Invalidate public PATCH snapshots that still contain this log.
        $inc: { __v: 1 },
        $pull: {
          logs: {
            date: date,
          },
        },
      }
    );
    return res.status(200).json(deleteResults);
  }

  return res.status(405).json({ message: "Method not allowed" });
});

export default AdminTransferLog;
