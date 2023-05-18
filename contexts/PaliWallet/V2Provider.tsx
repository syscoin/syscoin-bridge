import { NEVMNetwork } from "@contexts/Transfer/constants";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "react-query";
import { UTXOTransaction } from "syscoinjs-lib";
import { IPaliWalletContext, PaliWalletContext } from "./Provider";
import { utils as syscoinUtils } from "syscoinjs-lib";
import { PaliWallet } from "./types";
import MetamaskProvider from "@contexts/Metamask/Provider";

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
  switchTo: (networkType: PaliWalletNetworkType) => void;
}

declare global {
  interface Window {
    pali: Provider;
  }
}

export const PaliWalletV2Provider: React.FC<{
  children: React.ReactElement;
}> = ({ children }) => {
  const [isInstalled, setIsInstalled] = useState(false);
  const isBitcoinBased = useQuery(["pali", "isBitcoinBased"], {
    queryFn: () => {
      return window.pali.isBitcoinBased();
    },
    enabled: isInstalled,
  });
  const providerState = useQuery<ProviderState>(["pali", "provider-state"], {
    queryFn: () => {
      return window.pali.request({
        method: "wallet_getProviderState",
      });
    },
    enabled: isInstalled,
  });
  const connectedAccount = useQuery(["pali", "connected-account"], {
    queryFn: async () => {
      const account: Account = await window.pali.request({
        method: "wallet_getAccount",
      });
      return account;
    },
    enabled: isInstalled,
  });
  const sysAddress = useMemo(
    () =>
      connectedAccount.isSuccess && connectedAccount.data
        ? connectedAccount.data.address
        : undefined,
    [connectedAccount.data, connectedAccount.isSuccess]
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
        window.pali.request({ method: "sys_requestAccounts" }).then(() => {
          connectedAccount.refetch();
        });
      }
    },
    [connectedAccount]
  );

  const sendTransaction = useCallback(async (utxo: UTXOTransaction) => {
    const signedTransaction = await window.pali.request({
      method: "sys_signAndSend",
      params: [utxo],
    });

    const unserializedResp = syscoinUtils.importPsbtFromJson(
      signedTransaction,
      syscoinUtils.syscoinNetworks.mainnet
    );
    return {
      tx: unserializedResp.psbt.extractTransaction().getId(),
      error: null,
    };
  }, []);

  const switchTo = useCallback(
    (networkType: PaliWalletNetworkType) => {
      if (!isInstalled) {
        return;
      }

      if (networkType === "bitcoin") {
        window.pali.request({
          method: "sys_changeUTXOEVM",
          params: [
            {
              chainId: 57,
            },
          ],
        });
      } else if (networkType === "ethereum") {
        window.ethereum.request({
          method: "eth_changeUTXOEVM",
          params: [
            {
              chainId: 57,
            },
          ],
        });
      }
    },
    [isInstalled]
  );

  const value: IPaliWalletV2Context = useMemo(
    () => ({
      isInstalled,
      sendTransaction,
      connectWallet,
      isTestnet:
        providerState.isSuccess && providerState.data
          ? providerState.data.chainId !== NEVMNetwork.chainId
          : true,
      balance,
      connectedAccount: sysAddress,
      xpubAddress,
      version: "v2",
      chainType: providerState.data?.chainId === "0x39" ? "nevm" : "syscoin",
      isBitcoinBased: Boolean(isBitcoinBased.data),
      switchTo,
    }),
    [
      isInstalled,
      sendTransaction,
      connectWallet,
      providerState.isSuccess,
      providerState.data,
      balance,
      sysAddress,
      xpubAddress,
      isBitcoinBased.data,
      switchTo,
    ]
  );

  useEffect(() => {
    setIsInstalled(Boolean(window.pali) && window.pali.wallet === "pali-v2");
  }, []);

  return (
    <PaliWalletContext.Provider value={value}>
      <MetamaskProvider>{children}</MetamaskProvider>
    </PaliWalletContext.Provider>
  );
};
