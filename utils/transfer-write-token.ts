import { isSafeTransferId } from "./transfer-detail";

const TRANSFER_WRITE_TOKEN_PREFIX = "transfer-write-token-";

const activeWriteTokens = new Map<string, string>();

const getStorage = (): Storage | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

const getStorageKey = (transferId: string) =>
  `${TRANSFER_WRITE_TOKEN_PREFIX}${transferId}`;

const readStoredToken = (transferId: string): string | undefined => {
  try {
    return getStorage()?.getItem(getStorageKey(transferId)) ?? undefined;
  } catch {
    return undefined;
  }
};

const storeToken = (transferId: string, writeToken: string) => {
  try {
    getStorage()?.setItem(getStorageKey(transferId), writeToken);
  } catch {
    // The active-page copy still keeps an in-progress transfer writable.
  }
};

export const getTransferWriteToken = (
  transferId: string
): string | undefined => {
  const activeToken = activeWriteTokens.get(transferId);
  if (activeToken) {
    return activeToken;
  }

  const storedToken = readStoredToken(transferId);
  if (!storedToken) {
    return undefined;
  }

  activeWriteTokens.set(transferId, storedToken);
  return storedToken;
};

export const getOrCreateTransferWriteToken = (transferId: string): string => {
  const existingToken = getTransferWriteToken(transferId);
  if (existingToken) {
    return existingToken;
  }

  const writeToken = crypto.randomUUID();
  activeWriteTokens.set(transferId, writeToken);
  storeToken(transferId, writeToken);
  return writeToken;
};

export const listTransferWriteTokenIds = (): string[] => {
  const ids = new Set<string>();
  const storage = getStorage();
  if (storage) {
    try {
      for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (key?.startsWith(TRANSFER_WRITE_TOKEN_PREFIX)) {
          const id = key.slice(TRANSFER_WRITE_TOKEN_PREFIX.length);
          if (isSafeTransferId(id)) ids.add(id);
        }
      }
    } catch {
      // The active-page copy is still available when storage cannot be read.
    }
  }
  activeWriteTokens.forEach((_token, id) => {
    if (isSafeTransferId(id)) ids.add(id);
  });
  return Array.from(ids).reverse();
};

export const clearActiveTransferWriteTokensForTests = () => {
  activeWriteTokens.clear();
};
