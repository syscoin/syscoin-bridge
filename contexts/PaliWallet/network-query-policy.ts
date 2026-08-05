export type PaliWalletVersion = "v1" | "v2";
export type PaliWalletNetworkType = "bitcoin" | "ethereum";

export const isPaliV2UtxoMode = (
  version: PaliWalletVersion,
  isEVMInjected: boolean | undefined,
  isBitcoinBased: boolean | undefined
) => version === "v2" && Boolean(isEVMInjected) && Boolean(isBitcoinBased);

export const shouldRefreshNevmQueries = (
  isBitcoinBased: boolean | undefined,
  networkSwitchTarget: PaliWalletNetworkType | null
) => networkSwitchTarget !== "bitcoin" && isBitcoinBased === false;
