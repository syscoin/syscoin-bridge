import type { PaliWalletNetworkType } from "./network-query-policy";

type PaliProvider = {
  isBitcoinBased: () => boolean;
  request: (args: {
    method: string;
    params?: unknown[] | Record<string, unknown>;
  }) => Promise<unknown>;
};

type PaliNetworkSwitch = (
  networkType: PaliWalletNetworkType
) => Promise<void>;

type PaliAccountChange = () => Promise<unknown>;

export const getPaliSyscoinSwitchRequest = (
  isTestnet: boolean,
  isAlreadyOnUtxo: boolean
) => ({
  method: isAlreadyOnUtxo ? "sys_switchChain" : "sys_changeUTXOEVM",
  params: [
    {
      chainId: isTestnet ? 5700 : 57,
    },
  ],
});

export const readPaliBitcoinBasedState = async (provider: PaliProvider) => {
  try {
    const state = (await provider.request({
      method: "wallet_getSysProviderState",
    })) as { isBitcoinBased?: unknown } | null;

    if (typeof state?.isBitcoinBased === "boolean") {
      return state.isBitcoinBased;
    }
  } catch {
    // Older Pali v2 builds can fall back to the in-page provider state.
  }

  return Boolean(provider.isBitcoinBased());
};

export const switchToSyscoinThenChangeAccount = async (
  wasAlreadyOnUtxo: boolean,
  switchTo: PaliNetworkSwitch,
  changeAccount: PaliAccountChange
) => {
  await switchTo("bitcoin");
  if (wasAlreadyOnUtxo) {
    return changeAccount();
  }
};
