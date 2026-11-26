const stableId = "pali-v2";
const canaryId = "pali-canary:pali-v2";

type InjectedProvider = { wallet?: string; request?: unknown };

export function isModernPaliProvider(provider: InjectedProvider | undefined): boolean {
  return typeof provider?.request === "function" &&
    (provider.wallet === stableId || provider.wallet === canaryId);
}

export function selectPaliUtxoProvider<T extends InjectedProvider>(
  stableOrFallback: T | undefined,
  canary: T | undefined,
  ethereum: InjectedProvider | undefined
): T | undefined {
  const stable = stableOrFallback?.wallet === stableId &&
    isModernPaliProvider(stableOrFallback) ? stableOrFallback : undefined;
  const canaryProvider = canary?.wallet === canaryId && isModernPaliProvider(canary)
    ? canary
    : stableOrFallback?.wallet === canaryId && isModernPaliProvider(stableOrFallback)
      ? stableOrFallback
      : undefined;

  if (isModernPaliProvider(ethereum)) {
    return ethereum?.wallet === stableId ? stable : canaryProvider;
  }
  return stable ?? canaryProvider;
}

export function isMatchingPaliEthereumProvider(
  utxo: InjectedProvider | undefined,
  ethereum: InjectedProvider | undefined
): boolean {
  return Boolean(utxo && ethereum && utxo.wallet === ethereum.wallet &&
    isModernPaliProvider(ethereum));
}

export function getPaliNotificationEvent(wallet: string): string {
  return wallet === canaryId ? "pali-canary:paliNotification" : "paliNotification";
}
