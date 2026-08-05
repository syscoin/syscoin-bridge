import { ITransfer } from "@contexts/Transfer/types";

const TRANSFER_STORAGE_PREFIX = "transfer-";
const WRITE_TOKEN_STORAGE_PREFIX = "transfer-write-token-";

type StorageReader = Pick<Storage, "getItem" | "key" | "length">;

export const readStoredTransfers = (storage: StorageReader): ITransfer[] => {
  const transfers: ITransfer[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (
      !key?.startsWith(TRANSFER_STORAGE_PREFIX) ||
      key.startsWith(WRITE_TOKEN_STORAGE_PREFIX)
    ) {
      continue;
    }

    const storedValue = storage.getItem(key);
    if (!storedValue) {
      continue;
    }

    try {
      const transfer = JSON.parse(storedValue);
      if (
        typeof transfer === "object" &&
        transfer !== null &&
        typeof transfer.id === "string"
      ) {
        transfers.push(transfer as ITransfer);
      }
    } catch {
      // Ignore unrelated or corrupt local storage entries.
    }
  }

  return transfers;
};
