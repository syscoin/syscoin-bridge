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
  isBitcoinBased: boolean | undefined,
  isSwitchingToUtxo = false
) =>
  Boolean(isEVMInjected) &&
  !isLoading &&
  !isSwitchingToUtxo &&
  isBitcoinBased === false;

export const isNevmQueryReady = (
  isEthereumAvailable: boolean | undefined,
  isPaliV2: boolean,
  isPaliEvmInjected: boolean | undefined,
  isPaliLoading: boolean,
  isPaliBitcoinBased: boolean | undefined,
  isSwitchingToUtxo: boolean,
  isMetaMaskEnabled: boolean
) => {
  if (!isEthereumAvailable) {
    return false;
  }
  if (isPaliV2 && isPaliEvmInjected) {
    return isPaliEvmReady(
      isPaliEvmInjected,
      isPaliLoading,
      isPaliBitcoinBased,
      isSwitchingToUtxo
    );
  }
  return isMetaMaskEnabled;
};

export const isPaliUtxoQueryReady = (
  isInstalled: boolean | undefined,
  isModeFetched: boolean,
  isBitcoinBased: boolean | undefined,
  isSwitchingToUtxo = false
) =>
  Boolean(isInstalled) &&
  isModeFetched &&
  isBitcoinBased === true &&
  !isSwitchingToUtxo;

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
