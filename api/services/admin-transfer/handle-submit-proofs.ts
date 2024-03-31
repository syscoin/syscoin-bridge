import { AddSubmitProofsLogRequestPayload } from "api/types/admin/transfer/add-log";
import dbConnect from "lib/mongodb";
import { NextApiRequest, NextApiResponse } from "next";
import { verifySignature } from "utils/api/verify-signature";
import TransferModel from "models/transfer";
import Web3 from "web3";
import { RELAY_CONTRACT_ADDRESS } from "@constants";
import {
  COMMON_STATUS,
  ITransferLog,
  SYS_TO_ETH_TRANSFER_STATUS,
} from "@contexts/Transfer/types";
import { validateTransactionReceipt } from "./validate-relay-contract-receipt";

export const handleSubmitProofs = async (
  transferId: string,
  payload: AddSubmitProofsLogRequestPayload,
  req: NextApiRequest,
  res: NextApiResponse
) => {
  await dbConnect();
  const web3 = new Web3(process.env.NEVM_RPC_URL!);

  const { address } = req.session.user!;

  const transfer = await TransferModel.findOne({ id: transferId });
  if (!transfer) {
    return res.status(404).json({ message: "Transfer not found" });
  }

  const { clearAll, signedMessage, txHash, operation } = payload;

  const data = {
    operation,
    txHash,
    clearAll,
  };
  const message = JSON.stringify(data);
  if (!verifySignature(message, signedMessage, address)) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const receipt = await validateTransactionReceipt(
      web3,
      txHash,
      RELAY_CONTRACT_ADDRESS
    );
    if (clearAll) {
      transfer.logs = transfer.logs.filter(
        (log) =>
          !(
            log.status === SYS_TO_ETH_TRANSFER_STATUS.SUBMIT_PROOFS ||
            log.status === COMMON_STATUS.FINALIZING
          )
      );
    }

    const submitProofsLogs: ITransferLog = {
      payload: {
        data: {
          hash: receipt.transactionHash,
        },
        message: "submit-proofs",
        previousStatus: SYS_TO_ETH_TRANSFER_STATUS.GENERATE_PROOFS,
      },
      status: SYS_TO_ETH_TRANSFER_STATUS.SUBMIT_PROOFS,
      date: Date.now(),
    };

    transfer.logs.push(submitProofsLogs);

    const confirmLog: ITransferLog = {
      status: COMMON_STATUS.FINALIZING,
      payload: {
        data: receipt,
        message: "Confirm NEVM Transaction",
        previousStatus: SYS_TO_ETH_TRANSFER_STATUS.SUBMIT_PROOFS,
      },
      date: Date.now(),
    };

    transfer.logs.push(confirmLog);

    await transfer.save();

    res.status(200).json({ success: true });
  } catch (e) {
    if (e instanceof Error) {
      return res.status(400).json({ message: e.message });
    }

    return res.status(500).json({
      message: "Unknown error",
    });
  }
};
