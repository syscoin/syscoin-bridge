import { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import adminSessionGuard from "utils/api/admin-session-guard";
import { authorizeAdminTransferAction, isAdminTransferId } from "utils/api/admin-authorization";
import TransferModel from "models/transfer";
import dbConnect from "lib/mongodb";
import {
  COMMON_STATUS,
  ETH_TO_SYS_TRANSFER_STATUS,
  ITransfer,
  SYS_TO_ETH_TRANSFER_STATUS,
  TransferStatus,
} from "@contexts/Transfer/types";
import mongoose from "mongoose";

const statusForDirection = (type: ITransfer["type"], status: string): status is TransferStatus =>
  [
    ...Object.values(COMMON_STATUS),
    ...Object.values(type === "sys-to-nevm" ? SYS_TO_ETH_TRANSFER_STATUS : ETH_TO_SYS_TRANSFER_STATUS),
    "switch",
  ].includes(status);

const parseStatusChange = (input: unknown) => {
  if (!Array.isArray(input) || input.length !== 1) return;
  const change = input[0];
  if (
    change?.property !== "status" ||
    typeof change.from !== "string" || change.from.length > 64 ||
    typeof change.to !== "string" || change.to.length > 64
  ) return;
  return { property: "status", from: change.from, to: change.to } as const;
};

const fetchTransfer = async (id: string, res: NextApiResponse) => {
  await dbConnect();

  const transfer = (await TransferModel.findOne({ id })) as ITransfer;

  if (!transfer) {
    return res.status(404).json({ message: "Transfer not found" });
  }

  return res.status(200).json(transfer);
};

const AdminTransfer: NextApiHandler = adminSessionGuard(
  async (req: NextApiRequest, res: NextApiResponse) => {
    const { id } = req.query;
    if (!isAdminTransferId(id)) {
      return res.status(400).json({ message: "Invalid transfer ID" });
    }
    if (req.method === "GET") {
      return fetchTransfer(id, res);
    }
    if (req.method !== "POST") {
      return res.status(405).json({ message: "Method not allowed" });
    }

    const change = parseStatusChange(req.body?.changes);
    if (!change) {
      return res.status(400).json({ message: "Invalid transfer changes" });
    }
    if (!(await authorizeAdminTransferAction(req, res, "override", id, { changes: [change] }))) {
      return;
    }

    await dbConnect();

    const transfer = await TransferModel.findOne({ id });

    if (!transfer) {
      return res.status(404).json({ message: "Transfer not found" });
    }

    if (!statusForDirection(transfer.type, change.to)) {
      return res.status(400).json({ message: "Invalid status for this transfer direction" });
    }
    if (transfer.status !== change.from) {
      return res.status(409).json({ message: "Transfer status changed; refresh before retrying" });
    }

    transfer.status = change.to;
    // A signed administrator override explicitly resets public progress.
    // Existing chain logs still prevent accidental repeat submissions.
    transfer.set("progressStatus", undefined);

    // Scalar-only saves do not increment __v by default. Invalidate any public
    // PATCH snapshot taken before this signed administrator override.
    transfer.increment();
    try {
      const updatedTransfer = await transfer.save();
      return res.status(200).json(updatedTransfer);
    } catch (error) {
      if (error instanceof mongoose.Error.VersionError) {
        return res.status(409).json({
          message: "Transfer changed while saving; refresh before retrying",
        });
      }
      throw error;
    }
  }
);

export default AdminTransfer;
