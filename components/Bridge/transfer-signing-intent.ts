import type { ITransfer } from "@contexts/Transfer/types";
import { toSyscoinBaseUnits } from "utils/syscoin-amount";
import { getTransferWriteToken } from "utils/transfer-write-token";

type TransferIdentity = Pick<
  ITransfer,
  | "id"
  | "type"
  | "status"
  | "amount"
  | "utxoAddress"
  | "utxoXpub"
  | "nevmAddress"
  | "useSysx"
  | "utxoAssetType"
>;

export type TransferSigningIntent = TransferIdentity & {
  utxoAddress: string;
  nevmAddress: string;
};

export class TransferSigningIntentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransferSigningIntentError";
    Object.setPrototypeOf(this, TransferSigningIntentError.prototype);
  }
}

const staleIntent = () =>
  new TransferSigningIntentError(
    "Transfer details changed. Refresh and review the transfer before confirming."
  );

const unavailableIntent = () =>
  new TransferSigningIntentError(
    "Unable to verify the saved transfer. Please retry."
  );

const usesSysx = (transfer: TransferIdentity) =>
  Boolean(transfer.useSysx || transfer.utxoAssetType === "sysx");

const sameAmount = (left: string, right: string) => {
  try {
    return (
      typeof left === "string" &&
      typeof right === "string" &&
      toSyscoinBaseUnits(left) === toSyscoinBaseUnits(right)
    );
  } catch {
    return false;
  }
};

export const verifyTransferSigningIntent = async (
  expected: TransferIdentity
): Promise<TransferSigningIntent> => {
  if (typeof expected.id !== "string" || !/^[A-Za-z0-9_-]+$/.test(expected.id)) {
    throw staleIntent();
  }

  const token = getTransferWriteToken(expected.id);
  const response = await fetch(
    `/api/transfer/${encodeURIComponent(expected.id)}/signing-intent`,
    {
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }
  ).catch(() => {
    throw unavailableIntent();
  });

  if (response.status === 401) {
    throw new TransferSigningIntentError(
      "Open this transfer in the browser where it was started to continue."
    );
  }
  if (response.status === 404 || response.status === 409) {
    throw staleIntent();
  }
  if (!response.ok) {
    throw unavailableIntent();
  }

  const authorized: TransferSigningIntent = await response.json().catch(() => {
    throw unavailableIntent();
  });
  if (
    authorized?.id !== expected.id ||
    authorized.type !== expected.type ||
    authorized.status !== expected.status ||
    !sameAmount(authorized.amount, expected.amount) ||
    typeof authorized.utxoAddress !== "string" ||
    !authorized.utxoAddress ||
    authorized.utxoAddress !== expected.utxoAddress ||
    typeof authorized.nevmAddress !== "string" ||
    typeof expected.nevmAddress !== "string" ||
    !authorized.nevmAddress ||
    authorized.nevmAddress.toLowerCase() !== expected.nevmAddress.toLowerCase() ||
    (authorized.utxoXpub !== undefined &&
      typeof authorized.utxoXpub !== "string") ||
    (expected.utxoXpub !== undefined &&
      authorized.utxoXpub !== expected.utxoXpub) ||
    usesSysx(authorized) !== usesSysx(expected)
  ) {
    throw staleIntent();
  }
  return authorized;
};
