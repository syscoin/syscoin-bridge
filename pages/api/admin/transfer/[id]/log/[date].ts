import dbConnect from "lib/mongodb";
import { NextApiHandler } from "next";
import adminSessionGuard from "utils/api/admin-session-guard";
import TransferModel from "models/transfer";
import { getAdminOrigin, isAdminTransferId } from "utils/api/admin-authorization";
import { historyEvidenceMatchesLogs } from "api/services/admin-transfer/history-evidence";

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
    const transfer = await TransferModel.findOne({ id }).select("type logs __v +historyEvidence");
    if (!transfer) {
      return res.status(200).json({
        acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0, upsertedId: null,
      });
    }
    const logDate = Number(date);
    const sourceHash = transfer.historyEvidence?.sourceTransactionHash;
    const removeEvidence = sourceHash && !historyEvidenceMatchesLogs(
      transfer.type, transfer.logs.filter((log) => log.date !== logDate), sourceHash
    );
    const deleteResults = await TransferModel.updateOne(
      { _id: transfer._id, __v: transfer.__v === undefined ? { $exists: false } : transfer.__v },
      {
        // Keep log removal and public evidence invalidation in the same write.
        $inc: { __v: 1 },
        $pull: { logs: { date: logDate } },
        ...(removeEvidence ? { $unset: { historyEvidence: 1 } } : {}),
      }
    );
    if (!deleteResults.matchedCount) {
      return res.status(409).json({ message: "Transfer changed while saving; refresh before retrying" });
    }
    return res.status(200).json(deleteResults);
  }

  return res.status(405).json({ message: "Method not allowed" });
});

export default AdminTransferLog;
