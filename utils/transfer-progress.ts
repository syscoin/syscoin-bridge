import { COMMON_STATUS, ETH_TO_SYS_TRANSFER_STATUS, ITransfer, ITransferLog, TransferStatus } from "@contexts/Transfer/types";

export const isErrorLog = (log: ITransferLog) =>
  Object.keys(log.payload.data).length === 1 && "error" in log.payload.data;
const usesSysx = (transfer: ITransfer) => Boolean(transfer.useSysx || transfer.utxoAssetType === "sysx");

export const routeSteps = (transfer: ITransfer): string[] => transfer.type === "sys-to-nevm"
  ? [...(usesSysx(transfer) ? [] : ["burn-sys", "confirm-burn-sys"]),
    "burn-sysx", "confirm-burn-sysx", "generate-proofs", "submit-proofs", "finalizing", "completed"]
  : ["freeze-burn-sys", "confirm-freeze-burn-sys", "mint-sysx", "confirm-mint-sysx",
    "burn-sysx", "confirm-burn-sysx", "finalizing", "completed"];

export const stepForStatus = (transfer: ITransfer, status: string) => status === "switch"
  ? (transfer.type === "sys-to-nevm" ? "submit-proofs" : "mint-sysx") : status;

// Recorded submission/confirmation evidence determines the minimum next stage.
export const logProgressFloor = (transfer: ITransfer) => {
  const steps = routeSteps(transfer);
  return transfer.logs.reduce((floor, log) => {
    if (isErrorLog(log)) return floor;
    const data = log.payload.data;
    let stage: string | undefined;
    if (["burn-sys", "mint-sysx", "burn-sysx"].includes(log.status) && (data.tx || data.txid)) {
      stage = data.txid
        ? (log.status === "burn-sys" || log.status === "mint-sysx" ? "burn-sysx"
          : transfer.type === "sys-to-nevm" ? "generate-proofs" : "finalizing")
        : `confirm-${log.status}`;
    } else if (log.status === "freeze-burn-sys" && data.hash) stage = "confirm-freeze-burn-sys";
    else if (log.status === "confirm-freeze-burn-sys" && data.transactionHash) stage = "mint-sysx";
    else if (log.status === "generate-proofs" && data.transaction) stage = "submit-proofs";
    else if (log.status === "submit-proofs" && data.hash) stage = "finalizing";
    else if (log.status === "finalizing" && data.transactionHash) stage = "finalizing";
    return Math.max(floor, stage ? steps.indexOf(stage) : -1);
  }, 0);
};

/** Server callers must validate progress before persisting this high-water mark. */
export const verifiedTransferProgressStatus = (
  transfer: ITransfer, existing?: ITransfer
): TransferStatus => {
  const steps = routeSteps(transfer);
  const index = Math.max(logProgressFloor(transfer),
    steps.indexOf(stepForStatus(transfer, transfer.status)),
    existing ? steps.indexOf(stepForStatus(existing, existing.status)) : -1);
  return steps[index] as TransferStatus;
};

/** Display continuation only; never authorizes progress or accepts a client checkpoint. */
export const continueNevmTransferAfterError = (transfer: ITransfer, prior?: ITransfer): ITransfer => {
  if (transfer.type !== "nevm-to-sys" || transfer.status !== COMMON_STATUS.ERROR) return transfer;
  const checkpoint = verifiedTransferProgressStatus(transfer, prior);
  if (checkpoint === ETH_TO_SYS_TRANSFER_STATUS.FREEZE_BURN_SYS ||
    checkpoint === ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_FREEZE_BURN_SYS) return transfer;
  return { ...transfer, status: checkpoint };
};
