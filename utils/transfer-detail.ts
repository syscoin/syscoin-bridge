import type { ITransfer } from "@contexts/Transfer/types";
import isTransfer from "./isTransfer";

export const isSafeTransferId = (id: string) =>
  typeof id === "string" && id.length > 0 && !/[^A-Za-z0-9_-]/.test(id);

export const buildTransferPath = (id: string) => {
  if (!isSafeTransferId(id)) {
    throw new Error("Invalid transfer ID");
  }

  return `/api/transfer/${encodeURIComponent(id)}`;
};

export class TransferReadError extends Error {
  constructor(readonly status: number) {
    super("Unable to load transfer");
    Object.setPrototypeOf(this, TransferReadError.prototype);
  }
}

export const readTransferDetail = async (
  id: string,
  writeToken?: string,
  signal?: AbortSignal
): Promise<ITransfer> => {
  const response = await fetch(buildTransferPath(id), {
    cache: "no-store",
    credentials: "same-origin",
    redirect: "error",
    headers: writeToken ? { Authorization: `Bearer ${writeToken}` } : {},
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    throw new TransferReadError(response.status);
  }

  const transfer = await response.json();
  if (!isTransfer(transfer) || transfer.id !== id) {
    throw new Error("Invalid transfer");
  }
  return transfer;
};
