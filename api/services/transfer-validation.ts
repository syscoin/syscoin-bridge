import {
  COMMON_STATUS,
  ETH_TO_SYS_TRANSFER_STATUS,
  ITransfer,
  SYS_TO_ETH_TRANSFER_STATUS,
} from "@contexts/Transfer/types";
import { utils as syscoinUtils } from "syscoinjs-lib";
import { toSyscoinBaseUnits } from "utils/syscoin-amount";
import { isAddress } from "web3-utils";

export class TransferValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransferValidationError";
    Object.setPrototypeOf(this, TransferValidationError.prototype);
  }
}

const assertValid: (valid: unknown, message: string) => asserts valid = (
  valid,
  message
) => {
  if (!valid) throw new TransferValidationError(message);
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  Object.getPrototypeOf(value) === Object.prototype;

const usesSysx = (transfer: ITransfer) =>
  Boolean(transfer.useSysx || transfer.utxoAssetType === "sysx");

export const assertValidTransferPayload = (transfer: ITransfer): void => {
  assertValid(isPlainObject(transfer), "Invalid transfer payload");
  assertValid(
    typeof transfer.id === "string" && transfer.id.trim().length > 0,
    "Invalid transfer ID"
  );
  assertValid(
    transfer.type === "sys-to-nevm" || transfer.type === "nevm-to-sys",
    "Invalid transfer route"
  );
  const statuses: string[] = [
    ...Object.values(COMMON_STATUS),
    ...Object.values(
      transfer.type === "sys-to-nevm"
        ? SYS_TO_ETH_TRANSFER_STATUS
        : ETH_TO_SYS_TRANSFER_STATUS
    ),
    "switch",
  ];
  assertValid(statuses.includes(transfer.status), "Invalid transfer status");
  assertValid(
    typeof transfer.nevmAddress === "string" && isAddress(transfer.nevmAddress),
    "Invalid NEVM address"
  );
  assertValid(typeof transfer.utxoAddress === "string", "Invalid UTXO address");
  try {
    syscoinUtils.bitcoinjs.address.toOutputScript(
      transfer.utxoAddress,
      process.env.IS_TESTNET === "true"
        ? syscoinUtils.syscoinNetworks.testnet
        : syscoinUtils.syscoinNetworks.mainnet
    );
  } catch {
    throw new TransferValidationError("Invalid UTXO address for this network");
  }
  assertValid(
    transfer.utxoXpub === undefined || typeof transfer.utxoXpub === "string",
    "Invalid UTXO account"
  );
  assertValid(typeof transfer.amount === "string", "Invalid transfer amount");
  try {
    toSyscoinBaseUnits(transfer.amount);
  } catch (error) {
    throw new TransferValidationError(
      error instanceof Error ? error.message : "Invalid transfer amount"
    );
  }
  assertValid(transfer.agreedToTerms === true, "Terms must be accepted");
  assertValid(
    transfer.useSysx === undefined || typeof transfer.useSysx === "boolean",
    "Invalid SYSX selection"
  );
  assertValid(
    transfer.utxoAssetType === undefined ||
      transfer.utxoAssetType === "sys" ||
      transfer.utxoAssetType === "sysx",
    "Invalid UTXO asset"
  );
  assertValid(Array.isArray(transfer.logs), "Invalid transfer logs");
  for (const log of transfer.logs) {
    assertValid(
      isPlainObject(log) &&
        statuses.includes(log.status) &&
        Number.isSafeInteger(log.date) &&
        log.date >= 0 &&
        isPlainObject(log.payload) &&
        typeof log.payload.message === "string" &&
        isPlainObject(log.payload.data) &&
        (log.payload.previousStatus === undefined ||
          statuses.includes(log.payload.previousStatus)),
      "Invalid transfer log"
    );
    for (const field of ["hash", "tx", "transactionHash"]) {
      assertValid(
        log.payload.data[field] === undefined ||
          typeof log.payload.data[field] === "string",
        "Invalid transaction reference in transfer log"
      );
    }
  }
};

export const assertNewTransfer = (transfer: ITransfer): void => {
  assertValid(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      transfer.id
    ),
    "Invalid new transfer ID"
  );
  const initialStatus =
    transfer.type === "nevm-to-sys"
      ? ETH_TO_SYS_TRANSFER_STATUS.FREEZE_BURN_SYS
      : usesSysx(transfer)
      ? SYS_TO_ETH_TRANSFER_STATUS.BURN_SYSX
      : SYS_TO_ETH_TRANSFER_STATUS.BURN_SYS;
  assertValid(
    transfer.status === initialStatus && transfer.logs.length === 0,
    "New transfers must start at their initial transaction step"
  );
};

export const assertTransferIdentityUnchanged = (
  transfer: ITransfer,
  existing: ITransfer
): void => {
  assertValid(
    transfer.type === existing.type &&
      transfer.utxoAddress === existing.utxoAddress &&
      (transfer.utxoXpub || "") === (existing.utxoXpub || "") &&
      transfer.nevmAddress?.toLowerCase() === existing.nevmAddress?.toLowerCase() &&
      toSyscoinBaseUnits(transfer.amount) === toSyscoinBaseUnits(existing.amount) &&
      usesSysx(transfer) === usesSysx(existing),
    "Transfer route, accounts, asset and amount cannot be changed"
  );
};
