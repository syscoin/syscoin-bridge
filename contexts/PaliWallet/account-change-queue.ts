export type AccountChangeRefresh = () => Promise<void>;

/**
 * Coalesce overlapping wallet notifications without dropping the last one.
 * Wallets can notify before and after their injected provider state changes.
 */
export const createQueuedAccountChangeHandler = (
  refresh: AccountChangeRefresh
) => {
  let isProcessing = false;
  let hasPendingRefresh = false;

  return async (): Promise<void> => {
    if (isProcessing) {
      hasPendingRefresh = true;
      return;
    }

    isProcessing = true;

    try {
      do {
        hasPendingRefresh = false;
        await refresh();
      } while (hasPendingRefresh);
    } finally {
      isProcessing = false;
    }
  };
};
