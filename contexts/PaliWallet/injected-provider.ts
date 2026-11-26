const stableId = "pali-v2";
const canaryId = "pali-canary:pali-v2";

type InjectedProvider = { wallet?: string; request?: unknown };

// Allow window.ethereum to arrive after the UTXO providers. If EVM injection
// is disabled, a UTXO-only installation still needs to become usable.
export const PALI_INJECTION_GRACE_MS = 1000;

export function isModernPaliProvider(provider: InjectedProvider | undefined): boolean {
  return typeof provider?.request === "function" &&
    (provider.wallet === stableId || provider.wallet === canaryId);
}

export function selectPaliUtxoProvider<T extends InjectedProvider>(
  stableOrFallback: T | undefined,
  canary: T | undefined,
  ethereum: InjectedProvider | undefined,
  allowUtxoFallback: boolean
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
  if (ethereum && stable) return stable;
  return allowUtxoFallback ? stable ?? canaryProvider : undefined;
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
