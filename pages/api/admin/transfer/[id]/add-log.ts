import {
  AddBurnSysLogRequestPayload,
  AddLogRequestPayload,
} from "api/types/admin/transfer/add-log";
import dbConnect from "lib/mongodb";
import { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import adminSessionGuard from "utils/api/admin-session-guard";
import TransferModel from "models/transfer";
import { BlockbookAPIURL } from "@contexts/Transfer/constants";
import { utils as syscoinUtils } from "syscoinjs-lib";
import {
  ITransferLog,
  SYS_TO_ETH_TRANSFER_STATUS,
} from "@contexts/Transfer/types";

const handleBurnSys = async (
  transferId: string,
  data: AddBurnSysLogRequestPayload,
  res: NextApiResponse
) => {
  await dbConnect();
  const transfer = await TransferModel.findOne({ id: transferId });
  if (!transfer) {
    return res.status(404).json({ message: "Transfer not found" });
  }
  const { txId, clearAll } = data;

  const rawTransaction = await syscoinUtils.fetchBackendRawTx(
    BlockbookAPIURL,
    txId
  );

  if (rawTransaction.tokenType !== "SPTSyscoinBurnToAssetAllocation") {
    return res.status(400).json({ message: "Invalid transaction type" });
  }

  if (clearAll) {
    transfer.logs = transfer.logs.filter(
      (log) =>
        !(
          log.payload.message.includes("Confirm UTXO Transaction") &&
          log.status === "burn-sys"
        )
    );
  }

  const newLog: ITransferLog = {
    status: SYS_TO_ETH_TRANSFER_STATUS.BURN_SYS,
    payload: {
      data: rawTransaction,
      message: "Confirm UTXO Transaction",
      previousStatus: SYS_TO_ETH_TRANSFER_STATUS.BURN_SYS,
    },
    date: Date.now(),
  };

  transfer.logs.push(newLog);

  await transfer.save();

  res.status(200).json({ success: true });
};

const AdminTransferAddLog: NextApiHandler = adminSessionGuard(
  async (req: NextApiRequest, res: NextApiResponse) => {
    const body = req.body as AddLogRequestPayload;
    const { id } = req.query;
    if (body.operation === "burn-sys") {
      return handleBurnSys(id as string, body, res);
    }
    // Unsupported operation
    return res.status(400).json({ message: "Bad request" });
  }
);

export default AdminTransferAddLog;
