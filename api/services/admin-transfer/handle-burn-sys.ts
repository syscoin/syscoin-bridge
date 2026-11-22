import { AddBurnSysLogRequestPayload } from "api/types/admin/transfer/add-log";
import dbConnect from "lib/mongodb";
import { NextApiResponse } from "next";
import TransferModel from "models/transfer";
import {
  ITransferLog,
  SYS_TO_ETH_TRANSFER_STATUS,
} from "@contexts/Transfer/types";
import { CONFIRM_UTXO_TRANSACTION, verifyTxTokenTransfer } from "./constants";

export const handleBurnSys = async (
  transferId: string,
  payload: AddBurnSysLogRequestPayload,
  res: NextApiResponse
) => {
  await dbConnect();
  const transfer = await TransferModel.findOne({ id: transferId });
  if (!transfer) {
    return res.status(404).json({ message: "Transfer not found" });
  }
  const { txId, clearAll } = payload;

  const verifiedTransaction = await verifyTxTokenTransfer(
    txId,
    "SPTSyscoinBurnToAssetAllocation"
  );

  if (!verifiedTransaction) {
    return res.status(400).json({ message: "Invalid transaction type" });
  }

  if (clearAll) {
    transfer.logs = transfer.logs.filter((log) => !(log.status === "burn-sys"));
  }

  const burnSysLog: ITransferLog = {
    status: SYS_TO_ETH_TRANSFER_STATUS.BURN_SYS,
    payload: {
      data: {
        tx: txId,
      },
      message: "Burning SYS to SYSX",
      previousStatus: SYS_TO_ETH_TRANSFER_STATUS.BURN_SYS,
    },
    date: Date.now(),
  };

  transfer.logs.push(burnSysLog);

  const confirmLog: ITransferLog = {
    status: SYS_TO_ETH_TRANSFER_STATUS.BURN_SYS,
    payload: {
      data: verifiedTransaction,
      message: CONFIRM_UTXO_TRANSACTION,
      previousStatus: SYS_TO_ETH_TRANSFER_STATUS.BURN_SYS,
    },
    date: Date.now(),
  };

  transfer.logs.push(confirmLog);

  await transfer.save();

  res.status(200).json({ success: true });
};
