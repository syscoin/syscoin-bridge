import { AddBurnSysxLogRequestPayload } from "api/types/admin/transfer/add-log";
import dbConnect from "lib/mongodb";
import { NextApiResponse } from "next";
import TransferModel from "models/transfer";
import {
  ITransferLog,
  SYS_TO_ETH_TRANSFER_STATUS,
} from "@contexts/Transfer/types";
import {
  BURN_SYSX_TOKEN_TYPE,
  CONFIRM_UTXO_TRANSACTION,
  verifyTxTokenTransfer,
} from "./constants";
import { saveTransferSourceLogs } from "./history-evidence";

export const handleBurnSysx = async (
  transferId: string,
  payload: AddBurnSysxLogRequestPayload,
  res: NextApiResponse
) => {
  await dbConnect();
  const transfer = await TransferModel.findOne({ id: transferId }).select("+historyEvidence");
  if (!transfer) {
    return res.status(404).json({ message: "Transfer not found" });
  }
  const { txId, clearAll } = payload;

  const verifiedTransaction = await verifyTxTokenTransfer(
    txId,
    BURN_SYSX_TOKEN_TYPE
  );

  if (!verifiedTransaction) {
    return res.status(400).json({ message: "Invalid transaction type" });
  }

  if (clearAll) {
    transfer.logs = transfer.logs.filter(
      (log) => !(log.status === SYS_TO_ETH_TRANSFER_STATUS.BURN_SYSX)
    );
  }

  const burnSysxLog: ITransferLog = {
    status: SYS_TO_ETH_TRANSFER_STATUS.BURN_SYSX,
    payload: {
      data: {
        tx: txId,
      },
      message: "Burning SYSX to NEVM",
      previousStatus: SYS_TO_ETH_TRANSFER_STATUS.BURN_SYS,
    },
    date: Date.now(),
  };

  transfer.logs.push(burnSysxLog);

  const confirmLog: ITransferLog = {
    status: SYS_TO_ETH_TRANSFER_STATUS.BURN_SYSX,
    payload: {
      data: verifiedTransaction,
      message: CONFIRM_UTXO_TRANSACTION,
      previousStatus: SYS_TO_ETH_TRANSFER_STATUS.BURN_SYS,
    },
    date: Date.now(),
  };

  transfer.logs.push(confirmLog);

  return saveTransferSourceLogs(transfer, res);
};
