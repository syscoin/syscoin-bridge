import {
  ETH_TO_SYS_TRANSFER_STATUS,
  ITransferLog,
  SYS_TO_ETH_TRANSFER_STATUS,
  TransferType,
} from "@contexts/Transfer/types";
import type { Transfer } from "models/transfer";
import mongoose from "mongoose";
import type { NextApiResponse } from "next";
import { isErrorLog } from "utils/transfer-progress";

const hasSourceReference = (
  logs: ITransferLog[],
  sourceHash: string,
  status: ITransferLog["status"],
  field: "tx" | "hash" | "transactionHash"
): boolean => {
  const matches = (value: unknown) =>
    typeof value === "string" && value.toLowerCase() === sourceHash;
  let found = false;
  for (const log of logs) {
    if (log.status !== status) continue;
    const data = log.payload?.data;
    if (field === "hash" && typeof data === "string") {
      // V1 freeze submissions stored the hash directly.
      if (!matches(data)) return false;
      found = true;
      continue;
    }
    if (!data || typeof data !== "object") return false;
    if (isErrorLog(log)) continue;
    if (field === "tx") {
      // A UTXO confirmation can use txid, but the submission must use tx.
      if (data.txid !== undefined && !matches(data.txid)) return false;
      if (data.tx === undefined) continue;
    }
    if (!matches(data[field])) return false;
    found = true;
  }
  return found;
};

export const historyEvidenceMatchesLogs = (
  type: TransferType,
  logs: ITransferLog[],
  sourceTransactionHash: string
): boolean => {
  const hash = sourceTransactionHash.toLowerCase();
  if (type === "sys-to-nevm") {
    return hasSourceReference(logs, hash, SYS_TO_ETH_TRANSFER_STATUS.BURN_SYSX, "tx");
  }
  return hasSourceReference(logs, hash, ETH_TO_SYS_TRANSFER_STATUS.FREEZE_BURN_SYS, "hash") &&
    hasSourceReference(logs, hash, ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_FREEZE_BURN_SYS, "transactionHash");
};

export const saveTransferSourceLogs = async (transfer: Transfer, res: NextApiResponse) => {
  if (transfer.historyEvidence && !historyEvidenceMatchesLogs(
    transfer.type, transfer.logs, transfer.historyEvidence.sourceTransactionHash
  )) {
    transfer.set("historyEvidence", undefined);
  }
  // Compare the version even on an append, which ordinarily only increments it.
  transfer.increment();
  if (transfer.__v === undefined) {
    transfer.$where = { __v: { $exists: false } };
  }
  try {
    await transfer.save();
    return res.status(200).json({ success: true });
  } catch (error) {
    if (!(error instanceof mongoose.Error.VersionError)) throw error;
    return res.status(409).json({ message: "Transfer changed while saving; refresh before retrying" });
  }
};
