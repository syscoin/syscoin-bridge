import type { PaliWalletNetworkType } from "./network-query-policy";
import { getSyscoinChainId } from "utils/network-config";

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

type PaliAccountConnect = () => unknown | Promise<unknown>;

type PaliUtxoAccount = {
  address?: unknown;
};

export const discoverPaliUtxoAccount = async (
  provider: Pick<PaliProvider, "request">
): Promise<string | null> => {
  try {
    const account = (await provider.request({
      method: "wallet_getAccount",
    })) as PaliUtxoAccount | null;

    return typeof account?.address === "string" && account.address
      ? account.address
      : null;
  } catch {
    // Discovery must stay silent and non-interactive. A connection prompt is
    // only allowed from an explicit user action.
    return null;
  }
};

export const hasPaliUtxoAccountDetails = (
  address: string | undefined,
  xpub: string | undefined
) => Boolean(address && xpub);

export const connectPaliUtxoAccount = async (
  address: string | undefined,
  xpub: string | undefined,
  switchTo: PaliNetworkSwitch,
  connectAccount: PaliAccountConnect
) => {
  // An xpub without a valid address means Pali discovered an account on the
  // opposite Syscoin network. Move to the bridge's configured chain before
  // opening the account request, otherwise the returned address stays invalid.
  if (!address && xpub) {
    await switchTo("bitcoin");
  }

  return connectAccount();
};

export const getPaliSyscoinSwitchRequest = (
  isTestnet: boolean,
  isAlreadyOnUtxo: boolean
) => ({
  method: isAlreadyOnUtxo ? "sys_switchChain" : "sys_changeUTXOEVM",
  params: [
    {
      chainId: getSyscoinChainId(isTestnet),
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
