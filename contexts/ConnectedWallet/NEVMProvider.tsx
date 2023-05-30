import { createContext, useContext, useMemo, useState } from "react";
import { TransactionConfig } from "web3-core";
import Web3 from "web3";
import { NEVMNetwork } from "../Transfer/constants";
import { useQuery } from "react-query";
import { useMetamask } from "@contexts/Metamask/Provider";
import { usePaliWallet } from "@contexts/PaliWallet/usePaliWallet";
import { IPaliWalletV2Context } from "@contexts/PaliWallet/V2Provider";

interface INEVMContext {
  account?: string;
  balance?: string;
  isTestnet: boolean;
  switchToMainnet: () => void;
  sendTransaction: (transactionConfig: TransactionConfig) => Promise<string>;
  connect: () => void;
}

const NEVMContext = createContext({} as INEVMContext);

export const useNEVM = () => useContext(NEVMContext);

type NEVMProviderProps = {
  children: React.ReactNode;
};

const NEVMProvider: React.FC<NEVMProviderProps> = ({ children }) => {
  const { data: isEthereumAvailable } = useQuery(["nevm", "isEthAvailable"], {
    queryFn: () => {
      return typeof window.ethereum !== "undefined";
    },
  });

  const metamask = useMetamask();
  const paliWallet = usePaliWallet() as IPaliWalletV2Context;
  const isEnabled = useMemo(() => {
    if (!isEthereumAvailable) {
      return false;
    }
    if (paliWallet.version === "v2") {
      return !paliWallet.isBitcoinBased;
    }
    return metamask.isEnabled;
  }, [
    metamask.isEnabled,
    paliWallet.version,
    paliWallet.isBitcoinBased,
    isEthereumAvailable,
  ]);
  const web3 = useMemo(() => {
    if (!isEnabled) {
      return null;
    }
    return new Web3(window.ethereum);
  }, [isEnabled]);

  const { data: isTestnet } = useQuery(
    ["nevm", "isTestnet"],
    () => window?.ethereum?.networkVersion !== parseInt("0x39", 16).toString(),
    {
      enabled: isEnabled,
      refetchInterval: 1000,
    }
  );

  const account = useQuery(["nevm", "account"], {
    queryFn: () => {
      return window.ethereum.request({
        method: "eth_requestAccounts",
      });
    },
    enabled: isEnabled,
    refetchInterval: 1000,
  });

  const balance = useQuery(["nevm", "balance"], {
    queryFn: () => {
      if (!isEnabled || !web3 || !account.data) {
        return;
      }
      return web3.eth
        .getBalance(account.data[0])
        .then((balance) => web3.utils.fromWei(balance || "0"));
    },
    enabled: Boolean(isEnabled && account.isFetched && account.data),
  });

  const sendTransaction = (config: TransactionConfig) => {
    return window.ethereum.request({
      method: "eth_sendTransaction",
      params: [config],
    });
  };

  const switchToMainnet = () => {
    window.ethereum
      .request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x39" }],
      })
      .catch(({ code }) => {
        if (code === 4902) {
          window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [NEVMNetwork],
          });
        }
      });
  };

  const connect = () => {
    account.refetch();
  };

  return (
    <NEVMContext.Provider
      value={{
        account:
          account.isSuccess && account.data ? account.data[0] : undefined,
        sendTransaction,
        balance: balance.data,
        isTestnet: !!isTestnet,
        switchToMainnet,
        connect,
      }}
    >
      {children}
    </NEVMContext.Provider>
  );
};

export default NEVMProvider;