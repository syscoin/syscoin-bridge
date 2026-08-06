"use client";
import { useCallback, useMemo, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "react-query";
import { UTXOTransaction } from "syscoinjs-lib";
import PaliWalletContextProvider, {
  IPaliWalletContext,
  PaliWalletContext,
} from "./Provider";
import { utils as syscoinUtils } from "syscoinjs-lib";
import { PaliWallet } from "./types";
import MetamaskProvider from "@contexts/Metamask/Provider";
import { isValidSYSAddress } from "@sidhujag/sysweb3-utils";
import { useConstants } from "@contexts/useConstants";
import {
  getSyscoinChainId,
  resolveSyscoinIsTestnet,
} from "utils/network-config";
import {
  getPaliNevmQueryAction,
  isPaliUtxoQueryReady,
  PaliWalletNetworkType,
} from "./network-query-policy";
import {
  discoverPaliUtxoAccount,
  getPaliSyscoinSwitchRequest,
  readPaliBitcoinBasedState,
} from "./utxo-network";

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

export interface IPaliWalletV2Context extends IPaliWalletContext {
  chainType: string | undefined;
  isBitcoinBased: boolean;
  switchTo: (networkType: PaliWalletNetworkType) => Promise<void>;
  changeAccount: () => Promise<any>;
  isEVMInjected: boolean;
  isLoading: boolean;
  isSwitchingToUtxo: boolean;
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
  const { constants, refetch: refetchConstants } = useConstants();
  const isProcessingAccountChange = useRef(false);
  const networkSwitchTarget = useRef<PaliWalletNetworkType | null>(null);
  const [isSwitchingToUtxo, setIsSwitchingToUtxo] = useState(false);
  
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
  const isBridgeTestnet = resolveSyscoinIsTestnet(constants);

  const isBitcoinBased = useQuery(["pali", "isBitcoinBased"], {
    queryFn: async () => {
      if (typeof window === "undefined" || !window.pali) return false;
      return readPaliBitcoinBasedState(window.pali);
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

  const requestAccounts = useCallback(() => {
    return window.pali.request({
      method: "sys_requestAccounts",
    }) as Promise<(string | { success: boolean })[]>;
  }, []);

  // Automatic queries may only discover an existing connection. Opening the
  // account picker here can create a hidden pending request before the user
  // clicks Connect, causing every later wallet action to appear unresponsive.
  const utxoAccount = useQuery(["pali", "utxo-account"], {
    queryFn: () => discoverPaliUtxoAccount(window.pali),
    enabled: isPaliUtxoQueryReady(
      isInstalled,
      isBitcoinBased.isFetched,
      isBitcoinBased.data,
      isSwitchingToUtxo
    ),
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Get full account details (including xpub) after connection
  const accountDetails = useQuery(["pali", "account-details"], {
    queryFn: async () => {
      const account: Account = await window.pali.request({
        method: "wallet_getAccount",
      });
      return account;
    },
    enabled: Boolean(
      utxoAccount.data &&
        isBitcoinBased.data === true &&
        !isSwitchingToUtxo
    ),
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Extract the account from the connection result
  const finalAccount = accountDetails.data || null;

  const changeAccount = useCallback(() => {
    return window.pali.request({
      method: "wallet_changeAccount",
    });
  }, []);

  const sysAddress = useMemo(
    () =>
      finalAccount &&
      isValidSYSAddress(
        finalAccount.address,
        getSyscoinChainId(isBridgeTestnet)
      )
        ? finalAccount.address
        : undefined,
    [finalAccount, isBridgeTestnet]
  );

  const xpubAddress = useMemo(
    () =>
      finalAccount
        ? finalAccount.xpub
        : undefined,
    [finalAccount]
  );

  const balance = useMemo(
    () =>
      finalAccount
        ? finalAccount.balances.syscoin
        : undefined,
    [finalAccount]
  );

  const connectWallet = useCallback(async () => {
    const result = await requestAccounts();
    const selectedAccount = result[0];
    if (
      !selectedAccount ||
      (typeof selectedAccount !== "string" && !selectedAccount.success)
    ) {
      return;
    }

    const { data: discoveredAccount } = await utxoAccount.refetch();
    if (discoveredAccount) {
      await accountDetails.refetch();
    }
  }, [requestAccounts, utxoAccount, accountDetails]);

  const sendTransaction = useCallback(
    async (utxo: UTXOTransaction) => {
      const response = await window.pali.request({
        method: "sys_signAndSend",
        params: [utxo],
      });

      if (response.success === false) {
        return Promise.reject("unable to sign transaction");
      }

      // Handle different response formats:
      // 1. If response has txid (ISysTransaction), use it directly
      // 2. Fallback to PSBT parsing (legacy format)
      if (response.txid) {
        // ISysTransaction format - this is what sys_signAndSend returns
        return {
          tx: response.txid,
          error: null,
        };
      } else {
        // Fallback to PSBT parsing (legacy format)
        const unserializedResp = syscoinUtils.importPsbtFromJson(
          response,
          isBridgeTestnet
            ? syscoinUtils.syscoinNetworks.testnet
            : syscoinUtils.syscoinNetworks.mainnet
        );

        const transaction = unserializedResp.psbt.extractTransaction();

        return {
          tx: transaction.getId(),
          error: null,
        };
      }
    },
    [isBridgeTestnet]
  );

  const switchTo = useCallback(
    async (networkType: PaliWalletNetworkType) => {
      if (!isInstalled) {
        return Promise.reject("Pali Wallet is not installed");
      }

      networkSwitchTarget.current = networkType;
      if (networkType === "bitcoin") {
        setIsSwitchingToUtxo(true);
      }

      try {
        const activeConstants = constants ?? (await refetchConstants()).data;
        if (!activeConstants) {
          return Promise.reject("Bridge network configuration is unavailable");
        }
        const activeIsTestnet = resolveSyscoinIsTestnet(activeConstants);

        if (networkType === "bitcoin") {
          const { data: wasAlreadyOnUtxo } = await isBitcoinBased.refetch();

          // Stop active wallet-backed EVM queries before Pali changes mode.
          if (
            getPaliNevmQueryAction(
              isEVMInjected.data,
              wasAlreadyOnUtxo,
              networkType
            ) === "cancel"
          ) {
            await queryClient.cancelQueries(["nevm"]);
          }
          await window.pali.request(
            getPaliSyscoinSwitchRequest(
              activeIsTestnet,
              Boolean(wasAlreadyOnUtxo)
            )
          );
          await isBitcoinBased.refetch();
          return;
        }

        if (networkType === "ethereum") {
          const chainId = Number(activeConstants.chain_id);
          await window.ethereum.request({
            method: "eth_changeUTXOEVM",
            params: [
              {
                chainId: Number.isFinite(chainId)
                  ? chainId
                  : getSyscoinChainId(activeIsTestnet),
              },
            ],
          });
          const { data: bitcoinBased } = await isBitcoinBased.refetch();
          if (
            getPaliNevmQueryAction(
              isEVMInjected.data,
              bitcoinBased,
              networkType
            ) === "refresh"
          ) {
            await queryClient.invalidateQueries(["nevm"]);
          }
          return;
        }

        return Promise.reject("Invalid network type");
      } finally {
        if (networkType === "bitcoin") {
          setIsSwitchingToUtxo(false);
        }
        networkSwitchTarget.current = null;
      }
    },
    [
      finalAccount,
      isBitcoinBased,
      isInstalled,
      queryClient,
      isEVMInjected.data,
      constants,
      refetchConstants,
    ]
  );

  const isLoading = useMemo(
    () =>
      installed.isLoading ||
      isBitcoinBased.isLoading ||
      isEVMInjected.isLoading,
    [installed.isLoading, isBitcoinBased.isLoading, isEVMInjected.isLoading]
  );

  // Listen for account changes
  useEffect(() => {
    if (!isInstalled || !window.pali) return;

    const refreshQueriesForActiveNetwork = async () => {
      const currentAction = getPaliNevmQueryAction(
        isEVMInjected.data,
        isBitcoinBased.data,
        networkSwitchTarget.current
      );
      if (currentAction === "cancel") {
        await queryClient.cancelQueries(["nevm"]);
      }

      const { data: bitcoinBased } = await isBitcoinBased.refetch();
      const nextAction = getPaliNevmQueryAction(
        isEVMInjected.data,
        bitcoinBased,
        networkSwitchTarget.current
      );
      if (nextAction === "refresh") {
        await queryClient.invalidateQueries(["nevm"]);
        return bitcoinBased;
      }

      if (nextAction === "cancel" && currentAction !== "cancel") {
        await queryClient.cancelQueries(["nevm"]);
      }

      return bitcoinBased;
    };

    // Handle any account changes (both UTXO and EVM)
    const handleAccountsChanged = async () => {
      // Prevent recursive calls
      if (isProcessingAccountChange.current) {
        return;
      }
      
      isProcessingAccountChange.current = true;
      
      try {
        const bitcoinBased = await refreshQueriesForActiveNetwork();
        if (
          bitcoinBased &&
          networkSwitchTarget.current !== "ethereum"
        ) {
          await Promise.all([utxoAccount.refetch(), accountDetails.refetch()]);
        }
      } finally {
        // Reset after a short delay to allow legitimate subsequent changes.
        setTimeout(() => {
          isProcessingAccountChange.current = false;
        }, 100);
      }
    };

    // Listen for Pali notification events
    const handlePaliNotification = (event: any) => {
      try {
        const eventData = JSON.parse(event.detail);
        const data = eventData.data || eventData;
        
        if (data?.method === 'pali_xpubChanged' || data?.method === 'pali_accountsChanged') {
          void handleAccountsChanged();
        }

        // React to network-type and chain changes instantly
        if (data?.method === 'pali_isBitcoinBased') {
          void refreshQueriesForActiveNetwork();
        }

        if (data?.method === 'pali_chainChanged') {
          void refreshQueriesForActiveNetwork();
        }

        if (data?.method === 'pali_unlockStateChanged') {
          // When unlocking, refresh whichever side is active
          const unlocked = Boolean(data?.params?.isUnlocked ?? data?.params);
          if (unlocked) {
            // If on UTXO, refresh UTXO account/xpub; if on EVM, invalidate NEVM
            if (
              isBitcoinBased.data &&
              networkSwitchTarget.current !== "ethereum"
            ) {
              utxoAccount.refetch();
              accountDetails.refetch();
            } else {
              void refreshQueriesForActiveNetwork();
            }
          }
        }
      } catch (error) {
        // Ignore parsing errors
      }
    };

    window.addEventListener('paliNotification', handlePaliNotification);

    // Also listen for standard ethereum accountsChanged if in EVM mode
    let ethCleanup: (() => void) | undefined;
    
    if (
      window.ethereum &&
      isEVMInjected.data &&
      isBitcoinBased.isFetched &&
      !isBitcoinBased.data
    ) {
      const handleEthAccountsChanged = () => {
        // handleAccountsChanged will handle invalidating NEVM queries
        void handleAccountsChanged();
      };
      
      window.ethereum.on("accountsChanged", handleEthAccountsChanged);
      
      ethCleanup = () => {
        if (typeof (window.ethereum as any).removeListener === 'function') {
          (window.ethereum as any).removeListener("accountsChanged", handleEthAccountsChanged);
        } else if (typeof (window.ethereum as any).off === 'function') {
          (window.ethereum as any).off("accountsChanged", handleEthAccountsChanged);
        }
      };
    }

    // Cleanup function
    return () => {
      window.removeEventListener('paliNotification', handlePaliNotification);
      if (ethCleanup) {
        ethCleanup();
      }
    };
  }, [
    isInstalled,
    isEVMInjected.data,
    isBitcoinBased.data,
    isBitcoinBased.isFetched,
    queryClient,
  ]); // Dependencies needed for proper cleanup/setup

  const value: IPaliWalletV2Context = useMemo(
    () => ({
      isInstalled,
      sendTransaction,
      connectWallet,
      isTestnet: isBridgeTestnet,
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
      isSwitchingToUtxo,
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
      isSwitchingToUtxo,
      isBridgeTestnet,
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
