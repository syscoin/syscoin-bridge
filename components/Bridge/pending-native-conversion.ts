export type NativeConversionBroadcast = { tx: string; date: number };

const broadcasts = new Map<string, NativeConversionBroadcast>();
const storageKey = (id: string) => `bridge-native-conversion-${id}`;

export const readPendingNativeConversion = (id: string): NativeConversionBroadcast | null => {
  const active = broadcasts.get(id);
  if (active) return active;
  try {
    const pending = JSON.parse(window.localStorage.getItem(storageKey(id)) ?? "null");
    if (typeof pending?.tx === "string" && /^[a-f0-9]{64}$/i.test(pending.tx) &&
      Number.isSafeInteger(pending.date) && pending.date > 0) {
      return { tx: pending.tx, date: pending.date };
    }
  } catch {
    // The active page can still save its conversion when storage is blocked.
  }
  return null;
};

export const recordNativeConversion = (id: string, tx: string): NativeConversionBroadcast => {
  const broadcast = { tx, date: Date.now() };
  broadcasts.set(id, broadcast);
  try {
    window.localStorage.setItem(storageKey(id), JSON.stringify(broadcast));
  } catch {
    // The active-page record survives a step remount.
  }
  return broadcast;
};


export const clearPendingNativeConversion = (id: string, tx: string): void => {
  const pending = readPendingNativeConversion(id);
  if (pending?.tx.toLowerCase() !== tx.toLowerCase()) return;
  try {
    window.localStorage.removeItem(storageKey(id));
  } catch {
    // The server has already acknowledged this submission.
  }
  broadcasts.delete(id);
};
