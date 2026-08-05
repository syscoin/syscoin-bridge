export type PaliWalletVersion = "v1" | "v2";
export type PaliWalletNetworkType = "bitcoin" | "ethereum";
export type NevmQueryAction = "cancel" | "refresh" | "none";

export const isPaliV2UtxoMode = (
  version: PaliWalletVersion,
  isEVMInjected: boolean | undefined,
  isBitcoinBased: boolean | undefined
) => version === "v2" && Boolean(isEVMInjected) && Boolean(isBitcoinBased);

export const isPaliEvmReady = (
  isEVMInjected: boolean | undefined,
  isLoading: boolean,
  isBitcoinBased: boolean | undefined
) => Boolean(isEVMInjected) && !isLoading && isBitcoinBased === false;

export const getPaliNevmQueryAction = (
  isEVMInjected: boolean | undefined,
  isBitcoinBased: boolean | undefined,
  networkSwitchTarget: PaliWalletNetworkType | null
): NevmQueryAction => {
  if (!isEVMInjected) {
    return "none";
  }
  if (networkSwitchTarget === "bitcoin" || isBitcoinBased === true) {
    return "cancel";
  }
  return isBitcoinBased === false ? "refresh" : "none";
};
