import { AddBurnSysxLogRequestPayload } from "api/types/admin/transfer/add-log";
import dbConnect from "lib/mongodb";
import { NextApiRequest, NextApiResponse } from "next";
import TransferModel from "models/transfer";
import {
  ETH_TO_SYS_TRANSFER_STATUS,
  ITransferLog,
  SYS_TO_ETH_TRANSFER_STATUS,
} from "@contexts/Transfer/types";
import { verifySignature } from "utils/api/verify-signature";
import {
  BURN_SYSX_NEVM_TOKEN_TYPE,
  BURN_SYSX_SYS_TOKEN_TYPE,
  CONFIRM_UTXO_TRANSACTION,
  verifyTxTokenTransfer,
} from "./constants";

export const handleBurnSysx = async (
  transferId: string,
  payload: AddBurnSysxLogRequestPayload,
  req: NextApiRequest,
  res: NextApiResponse
) => {
  await dbConnect();
  const { address } = req.session.user!;
  const transfer = await TransferModel.findOne({ id: transferId });
  if (!transfer) {
    return res.status(404).json({ message: "Transfer not found" });
  }
  const { txId, clearAll, operation, signedMessage } = payload;
  const data = {
    operation,
    txId,
    clearAll,
  };
  const message = JSON.stringify(data);

  if (!verifySignature(message, signedMessage, address)) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const verifiedTransaction = await verifyTxTokenTransfer(
    txId,
    transfer.type === "sys-to-nevm"
      ? BURN_SYSX_NEVM_TOKEN_TYPE
      : BURN_SYSX_SYS_TOKEN_TYPE
  );

  if (!verifiedTransaction) {
    return res.status(400).json({ message: "Invalid transaction type" });
  }

  if (clearAll) {
    transfer.logs = transfer.logs.filter(
      (log) =>
        !(
          log.status === SYS_TO_ETH_TRANSFER_STATUS.BURN_SYSX ||
          log.status === ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_BURN_SYSX
        )
    );
  }

  const previousStatus =
    transfer.type === "sys-to-nevm"
      ? SYS_TO_ETH_TRANSFER_STATUS.BURN_SYS
      : ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_MINT_SYSX;

  const burnSysxLog: ITransferLog = {
    status: SYS_TO_ETH_TRANSFER_STATUS.BURN_SYSX,
    payload: {
      data: {
        tx: txId,
      },
      message:
        transfer.type === "sys-to-nevm"
          ? "Burning SYSX to NEVM"
          : "Burning SYSX to SYS",
      previousStatus,
    },
    date: Date.now(),
  };

  transfer.logs.push(burnSysxLog);

  const confirmLog: ITransferLog = {
    status: SYS_TO_ETH_TRANSFER_STATUS.CONFIRM_BURN_SYSX,
    payload: {
      data: verifiedTransaction,
      message: CONFIRM_UTXO_TRANSACTION,
      previousStatus: ETH_TO_SYS_TRANSFER_STATUS.BURN_SYSX,
    },
    date: Date.now(),
  };

  transfer.logs.push(confirmLog);

  await transfer.save();

  res.status(200).json({ success: true });
};
