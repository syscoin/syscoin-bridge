"use client";
import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "react-query";
import { UTXOTransaction } from "syscoinjs-lib";
import PaliWalletContextProvider, {
  IPaliWalletContext,
  PaliWalletContext,
} from "./Provider";
import { utils as syscoinUtils } from "syscoinjs-lib";
import { PaliWallet } from "./types";
import MetamaskProvider from "@contexts/Metamask/Provider";
import { isValidSYSAddress } from "@pollum-io/sysweb3-utils";
import { useConstants } from "@contexts/useConstants";

export interface ProviderState {
  xpub: string;
  blockExplorerURL: string;
  isUnlocked: boolean;
  chainId: string;
}

export interface Account {
  address: string;
  id: number;
  isTrezorWallet: boolean;
  label: string;
  transactions: PaliWallet.Transaction[];
  assets: Assets;
  xpub: string;
  balances: Balances;
}

export interface Assets {
  ethereum: any[];
  syscoin: any[];
}

export interface Balances {
  syscoin: number;
  ethereum: number;
}

interface RequestArguments {
  /** The RPC method to request. */
  method: string;

  /** The params of the RPC method, if any. */
  params?: unknown[] | Record<string, unknown>;
}

interface Provider {
  wallet: string;
  chainType: string;
  request: (args: RequestArguments) => Promise<any>;
  enable: () => Promise<string[]>;
  disable: () => Promise<string[]>;
  isBitcoinBased: () => boolean;
}

type PaliWalletNetworkType = "bitcoin" | "ethereum";

export interface IPaliWalletV2Context extends IPaliWalletContext {
  chainType: string | undefined;
  isBitcoinBased: boolean;
  switchTo: (networkType: PaliWalletNetworkType) => Promise<void>;
  changeAccount: () => void;
  isEVMInjected: boolean;
  isLoading: boolean;
}

declare global {
  interface Window {
    pali: Provider;
  }
}

export const PaliWalletV2Provider: React.FC<{
  children: React.ReactElement;
}> = ({ children }) => {
  const queryClient = useQueryClient();
  const { constants } = useConstants();
  const installed = useQuery(["pali", "is-installed"], {
    queryFn: () => {
      if (typeof window === "undefined") return false;
      return Boolean(window.pali) && window.pali.wallet === "pali-v2";
    },
    refetchInterval: 1000,
    enabled: typeof window !== "undefined",
  });

  const isEVMInjected = useQuery(["pali", "is-ethereum-injected"], {
    queryFn: () => {
      if (typeof window === "undefined") return false;
      return Boolean(window.ethereum) && window.ethereum.wallet === "pali-v2";
    },
    refetchInterval: 1000,
    enabled: typeof window !== "undefined",
  });

  const isInstalled = installed.isFetched && installed.data;

  const isBitcoinBased = useQuery(["pali", "isBitcoinBased"], {
    queryFn: () => {
      if (typeof window === "undefined" || !window.pali) return false;
      const bitcoinBased = window.pali.isBitcoinBased();
      return Boolean(bitcoinBased);
    },
    enabled: isInstalled && typeof window !== "undefined",
    refetchInterval: 1000,
  });

  const providerState = useQuery<ProviderState | null>(["pali", "provider-state"], {
    queryFn: async (): Promise<ProviderState | null> => {
      if (typeof window === "undefined" || !window.pali) return null;
      try {
        return await window.pali.request({
          method: "wallet_getProviderState",
        });
      } catch (error) {
        return null;
      }
    },
    enabled: isInstalled && typeof window !== "undefined",
  });

  const requestAccounts = () => {
    return window.pali.request({
      method: "sys_requestAccounts",
    }) as Promise<(string | { success: boolean })[]>;
  };

  const connectedAccount = useQuery(["pali", "connected-account"], {
    queryFn: async () => {
      let account: Account = await window.pali.request({
        method: "wallet_getAccount",
      });

      if (account) {
        return account;
      }

      const receivedAccounts = await requestAccounts();

      if (
        receivedAccounts.length === 0 ||
        (typeof receivedAccounts[0] !== "string" &&
          receivedAccounts[0].success === false)
      ) {
        return null;
      }
      return await window.pali.request({
        method: "wallet_getAccount",
      });
    },
    enabled: isInstalled && isBitcoinBased.isFetched && isBitcoinBased.data,
  });

  const changeAccount = useCallback(() => {
    return window.pali.request({
      method: "wallet_changeAccount",
    });
  }, []);

  const sysAddress = useMemo(
    () =>
      connectedAccount.isSuccess &&
      connectedAccount.data &&
      isValidSYSAddress(
        connectedAccount.data.address,
        constants?.isTestnet ? 5700 : 57
      )
        ? connectedAccount.data.address
        : undefined,
    [connectedAccount.data, connectedAccount.isSuccess, constants?.isTestnet]
  );

  const xpubAddress = useMemo(
    () =>
      connectedAccount.isSuccess && connectedAccount.data
        ? connectedAccount.data.xpub
        : undefined,
    [connectedAccount.data, connectedAccount.isSuccess]
  );

  const balance = useMemo(
    () =>
      connectedAccount.isSuccess && connectedAccount.data
        ? connectedAccount.data.balances.syscoin
        : undefined,
    [connectedAccount.data, connectedAccount.isSuccess]
  );

  const connectWallet = useCallback(
    (networkType: PaliWalletNetworkType = "bitcoin") => {
      if (networkType === "bitcoin") {
        window.pali
          .request({ method: "sys_requestAccounts" })
          .then(() => connectedAccount.refetch());
      }
    },
    [connectedAccount]
  );

  const sendTransaction = useCallback(
    async (utxo: UTXOTransaction) => {
      const signedPsbt = await window.pali.request({
        method: "sys_signAndSend",
        params: [utxo],
      });

      if (signedPsbt.success === false) {
        return Promise.reject("unable to sign transaction");
      }

      const unserializedResp = syscoinUtils.importPsbtFromJson(
        signedPsbt,
        constants?.isTestnet
          ? syscoinUtils.syscoinNetworks.testnet
          : syscoinUtils.syscoinNetworks.mainnet
      );

      const transaction = unserializedResp.psbt.extractTransaction();

      return {
        tx: transaction.getId(),
        error: null,
      };
    },
    [constants?.isTestnet]
  );

  const switchTo = useCallback(
    (networkType: PaliWalletNetworkType) => {
      if (!isInstalled) {
        return Promise.reject("Pali Wallet is not installed");
      }

      const chainId = parseInt(constants?.chain_id ?? "0x39", 16);

      if (networkType === "bitcoin") {
        return window.pali
          .request({
            method: "sys_changeUTXOEVM",
            params: [
              {
                chainId,
              },
            ],
          })
          .then(() => {
            isBitcoinBased.refetch().then(() => connectedAccount.refetch());
          });
      } else if (networkType === "ethereum") {
        return window.ethereum
          .request({
            method: "eth_changeUTXOEVM",
            params: [
              {
                chainId,
              },
            ],
          })
          .then(() => {
            queryClient.invalidateQueries(["nevm"]);
          });
      }
      return Promise.reject("Invalid network type");
    },
    [
      connectedAccount,
      isBitcoinBased,
      isInstalled,
      queryClient,
      constants?.chain_id,
    ]
  );

  const isLoading = useMemo(
    () =>
      installed.isLoading ||
      isBitcoinBased.isLoading ||
      isEVMInjected.isLoading,
    [installed.isLoading, isBitcoinBased.isLoading, isEVMInjected.isLoading]
  );

  const value: IPaliWalletV2Context = useMemo(
    () => ({
      isInstalled,
      sendTransaction,
      connectWallet,
      isTestnet: Boolean(constants?.isTestnet),
      balance,
      connectedAccount: sysAddress,
      xpubAddress,
      version: "v2",
      chainType:
        providerState.data?.chainId === constants?.chain_id
          ? "nevm"
          : "syscoin",
      isBitcoinBased: Boolean(isBitcoinBased.data),
      switchTo,
      changeAccount,
      isEVMInjected: isEVMInjected.isFetched && Boolean(isEVMInjected.data),
      isLoading,
    }),
    [
      isInstalled,
      sendTransaction,
      connectWallet,
      providerState.data,
      balance,
      sysAddress,
      xpubAddress,
      isBitcoinBased.data,
      switchTo,
      changeAccount,
      isEVMInjected,
      isLoading,
      constants?.isTestnet,
      constants?.chain_id,
    ]
  );

  if (!isInstalled) {
    return <PaliWalletContextProvider> {children}</PaliWalletContextProvider>;
  }

  return (
    <PaliWalletContext.Provider value={value}>
      <MetamaskProvider>{children}</MetamaskProvider>
    </PaliWalletContext.Provider>
  );
};
