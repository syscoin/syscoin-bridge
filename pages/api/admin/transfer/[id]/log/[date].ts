import dbConnect from "lib/mongodb";
import { NextApiHandler } from "next";
import adminSessionGuard from "utils/api/admin-session-guard";
import TransferModel from "models/transfer";

const AdminTransferLog: NextApiHandler = adminSessionGuard(async (req, res) => {
  if (req.method === "DELETE") {
    const { id, date } = req.query;

    await dbConnect();
    const deleteResults = await TransferModel.updateMany(
      { id },
      {
        $pull: {
          logs: {
            date: date,
          },
        },
      }
    );
    return res.status(200).json(deleteResults);
  }
});

export default AdminTransferLog;
