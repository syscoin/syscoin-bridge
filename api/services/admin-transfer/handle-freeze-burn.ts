import { AddFreezeAndBurnLogRequestPayload } from "api/types/admin/transfer/add-log";
import dbConnect from "lib/mongodb";
import { NextApiRequest, NextApiResponse } from "next";
import { verifySignature } from "utils/api/verify-signature";
import TransferModel from "models/transfer";
import Web3 from "web3";
import {
  COMMON_STATUS,
  ETH_TO_SYS_TRANSFER_STATUS,
  ITransferLog,
} from "@contexts/Transfer/types";
import { validateTransactionReceipt } from "./validate-relay-contract-receipt";
import { ERC20_MANAGER_CONTRACT_ADDRESS, NEVM_RPC_URL } from "@constants";

export const handleFreezeBurn = async (
  transferId: string,
  payload: AddFreezeAndBurnLogRequestPayload,
  req: NextApiRequest,
  res: NextApiResponse
) => {
  await dbConnect();
  const web3 = new Web3(NEVM_RPC_URL);

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
      ERC20_MANAGER_CONTRACT_ADDRESS
    );

    if (clearAll) {
      transfer.logs = transfer.logs.filter(
        (log) =>
          !(
            log.status === ETH_TO_SYS_TRANSFER_STATUS.FREEZE_BURN_SYS ||
            log.status === ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_FREEZE_BURN_SYS
          )
      );
    }

    const freezeBurnLog: ITransferLog = {
      payload: {
        data: {
          hash: receipt.transactionHash,
        },
        message: "Freeze and Burn SYS",
        previousStatus: COMMON_STATUS.INITIALIZE,
      },
      status: ETH_TO_SYS_TRANSFER_STATUS.FREEZE_BURN_SYS,
      date: Date.now(),
    };

    transfer.logs.push(freezeBurnLog);

    const confirmLog: ITransferLog = {
      status: ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_FREEZE_BURN_SYS,
      payload: {
        data: receipt,
        message: "Confirm NEVM Transaction",
        previousStatus: ETH_TO_SYS_TRANSFER_STATUS.FREEZE_BURN_SYS,
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
