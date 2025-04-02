import { AddMintSysxLogRequestPayload } from "api/types/admin/transfer/add-log";
import dbConnect from "lib/mongodb";
import { NextApiRequest, NextApiResponse } from "next";
import TransferModel from "models/transfer";
import {
  ETH_TO_SYS_TRANSFER_STATUS,
  ITransferLog,
} from "@contexts/Transfer/types";
import { verifySignature } from "utils/api/verify-signature";
import {
  CONFIRM_UTXO_TRANSACTION,
  MINT_SYSX_TOKEN_TYPE,
  verifyTxTokenTransfer,
} from "./constants";

export const handleMintSysx = async (
  transferId: string,
  payload: AddMintSysxLogRequestPayload,
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
    MINT_SYSX_TOKEN_TYPE
  );

  if (!verifiedTransaction) {
    return res.status(400).json({ message: "Invalid transaction type" });
  }

  if (clearAll) {
    transfer.logs = transfer.logs.filter(
      (log) => !(log.status === ETH_TO_SYS_TRANSFER_STATUS.MINT_SYSX)
    );
  }

  const burnSysxLog: ITransferLog = {
    status: ETH_TO_SYS_TRANSFER_STATUS.MINT_SYSX,
    payload: {
      data: {
        tx: txId,
      },
      message: "Mint SYSX to Utxo",
      previousStatus: ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_FREEZE_BURN_SYS,
    },
    date: Date.now(),
  };

  transfer.logs.push(burnSysxLog);

  const confirmLog: ITransferLog = {
    status: ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_MINT_SYSX,
    payload: {
      data: verifiedTransaction,
      message: CONFIRM_UTXO_TRANSACTION,
      previousStatus: ETH_TO_SYS_TRANSFER_STATUS.MINT_SYSX,
    },
    date: Date.now(),
  };

  transfer.logs.push(confirmLog);

  await transfer.save();

  res.status(200).json({ success: true });
};
