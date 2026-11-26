const stableId = "pali-v2";
const canaryId = "pali-canary:pali-v2";

export function isModernPaliProvider(
  provider: { wallet?: string; request?: unknown } | undefined
): boolean {
  return typeof provider?.request === "function" &&
    (provider.wallet === stableId || provider.wallet === canaryId);
}

export function selectPaliUtxoProvider<T extends { wallet: string; request: unknown }>(
  stableOrFallback: T | undefined,
  canary: T | undefined
): T | undefined {
  if (stableOrFallback?.wallet === stableId && isModernPaliProvider(stableOrFallback)) {
    return stableOrFallback;
  }
  if (canary?.wallet === canaryId && isModernPaliProvider(canary)) {
    return canary;
  }
  if (stableOrFallback?.wallet === canaryId && isModernPaliProvider(stableOrFallback)) {
    return stableOrFallback;
  }
}

export function isMatchingPaliEthereumProvider(
  utxo: { wallet: string } | undefined,
  ethereum: { wallet?: string; request?: unknown } | undefined
): boolean {
  return Boolean(utxo && ethereum && utxo.wallet === ethereum.wallet &&
    isModernPaliProvider(ethereum));
}

export function getPaliNotificationEvent(wallet: string): string {
  return wallet === canaryId ? "pali-canary:paliNotification" : "paliNotification";
}
