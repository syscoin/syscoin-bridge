import { AddBurnSysxLogRequestPayload } from "api/types/admin/transfer/add-log";
import dbConnect from "lib/mongodb";
import { NextApiRequest, NextApiResponse } from "next";
import TransferModel from "models/transfer";
import {
  ITransferLog,
  SYS_TO_ETH_TRANSFER_STATUS,
} from "@contexts/Transfer/types";
import { verifySignature } from "utils/api/verify-signature";
import {
  BURN_SYSX_TOKEN_TYPE,
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
    BURN_SYSX_TOKEN_TYPE
  );

  if (!verifiedTransaction) {
    return res.status(400).json({ message: "Invalid transaction type" });
  }

  if (clearAll) {
    transfer.logs = transfer.logs.filter(
      (log) =>
        !(
          log.payload.message.includes(CONFIRM_UTXO_TRANSACTION) &&
          log.status === SYS_TO_ETH_TRANSFER_STATUS.BURN_SYSX
        )
    );
  }

  const newLog: ITransferLog = {
    status: SYS_TO_ETH_TRANSFER_STATUS.BURN_SYSX,
    payload: {
      data: verifiedTransaction,
      message: CONFIRM_UTXO_TRANSACTION,
      previousStatus: SYS_TO_ETH_TRANSFER_STATUS.BURN_SYS,
    },
    date: Date.now(),
  };

  transfer.logs.push(newLog);

  await transfer.save();

  res.status(200).json({ success: true });
};
