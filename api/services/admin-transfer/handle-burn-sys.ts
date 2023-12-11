import { AddBurnSysLogRequestPayload } from "api/types/admin/transfer/add-log";
import dbConnect from "lib/mongodb";
import { NextApiRequest, NextApiResponse } from "next";
import TransferModel from "models/transfer";
import { BlockbookAPIURL } from "@contexts/Transfer/constants";
import { utils as syscoinUtils } from "syscoinjs-lib";
import {
  ITransferLog,
  SYS_TO_ETH_TRANSFER_STATUS,
} from "@contexts/Transfer/types";
import { verifySignature } from "utils/api/verify-signature";
import { verifyTxTokenTransfer } from "./constants";

export const handleBurnSys = async (
  transferId: string,
  payload: AddBurnSysLogRequestPayload,
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
    "SPTSyscoinBurnToAssetAllocation"
  );

  if (!verifiedTransaction) {
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
      data: verifiedTransaction,
      message: "Confirm UTXO Transaction",
      previousStatus: SYS_TO_ETH_TRANSFER_STATUS.BURN_SYS,
    },
    date: Date.now(),
  };

  transfer.logs.push(newLog);

  await transfer.save();

  res.status(200).json({ success: true });
};
