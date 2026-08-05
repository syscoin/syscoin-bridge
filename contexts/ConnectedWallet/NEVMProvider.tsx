import { createContext, useContext, useEffect, useMemo } from "react";
import { TransactionConfig } from "web3-core";
import Web3 from "web3";
import { NEVMNetwork } from "../Transfer/constants";
import { useQuery } from "react-query";
import { useMetamask } from "@contexts/Metamask/Provider";
import { usePaliWallet } from "@contexts/PaliWallet/usePaliWallet";
import { IPaliWalletV2Context } from "@contexts/PaliWallet/V2Provider";
import { captureException } from "@sentry/nextjs";
import { useConstants } from "@contexts/useConstants";
import {
  getNevmAccountRequestMethod,
  isNevmQueryReady,
  isPaliV2UtxoMode,
} from "@contexts/PaliWallet/network-query-policy";
import { normalizeEvmChainId } from "utils/network-config";

interface INEVMContext {
  account?: string;
  balance?: string;
  isTestnet: boolean;
  chainId?: string;
  expectedChainId: string;
  isExpectedChain: boolean;
  isWrongChain: boolean;
  switchToMainnet: () => void;
  sendTransaction: (transactionConfig: TransactionConfig) => Promise<string>;
  signMessage: (message: string) => Promise<string>;
  connect: () => void;
}

export const MAINNET_CHAIN_ID = "0x39";

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
  const { constants } = useConstants();

  const metamask = useMetamask();
  const paliWallet = usePaliWallet() as IPaliWalletV2Context;
  const isPaliEvmProvider =
    paliWallet.version === "v2" && paliWallet.isEVMInjected;
  const isPaliOnUtxo = isPaliV2UtxoMode(
    paliWallet.version,
    paliWallet.isEVMInjected,
    paliWallet.isBitcoinBased
  );
  const isEnabled = useMemo(
    () =>
      isNevmQueryReady(
        isEthereumAvailable,
        paliWallet.version === "v2",
        paliWallet.isEVMInjected,
        paliWallet.isLoading,
        paliWallet.isBitcoinBased,
        paliWallet.isSwitchingToUtxo,
        metamask.isEnabled
      ),
    [
      isEthereumAvailable,
      metamask.isEnabled,
      paliWallet.version,
      paliWallet.isEVMInjected,
      paliWallet.isBitcoinBased,
      paliWallet.isLoading,
      paliWallet.isSwitchingToUtxo,
    ]
  );
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
    queryFn: async () => {
      try {
        // Double-check we're on EVM network before requesting accounts
        if (
          isPaliEvmProvider &&
          (paliWallet.isBitcoinBased || paliWallet.isSwitchingToUtxo)
        ) {
          return null; // Don't request ETH accounts when on UTXO
        }
        
        const result: (string | { success: false })[] =
          await window.ethereum.request({
            // Account discovery runs automatically, so it must never open a
            // wallet prompt. The interactive method is reserved for connect().
            method: getNevmAccountRequestMethod("discover"),
          });
        if (
          result.length > 0 &&
          typeof result[0] === "string" &&
          web3?.utils.isAddress(result[0])
        ) {
          return result[0];
        }
        return null;
      } catch (error: any) {
        // Network switch and other user cancellations are handled the same way
        // The simplified popup system means all rejections are user cancellations
        
        // Check if this is a user cancellation error
        if (error?.message?.includes('Request cancelled') || 
            error?.message?.includes('User rejected') ||
            error?.message?.includes('popup closure') ||
            error?.message?.includes('cancelled') ||
            error?.message?.includes('Network switch was cancelled') ||
            error?.message?.includes('Duplicate') ||
            error?.code === 4001 ||
            error?.code === -32603) { // Internal error often means user cancellation
          console.log('User cancelled eth_requestAccounts:', error?.message);
          return null; // Return null instead of throwing to prevent cascade
        }
        
        // Don't retry when user cancels eth_requestAccounts
        // This prevents multiple popups when user cancels network switch
        console.error('eth_requestAccounts failed:', error);
        throw error; // Re-throw the original error for other errors
      }
    },
    enabled: Boolean(web3) && isEnabled && !isPaliOnUtxo,
    retry: false, // Don't retry user interaction methods
    refetchOnWindowFocus: false, // Don't refetch on focus
  });

  const balance = useQuery(["nevm", "balance"], {
    queryFn: () => {
      if (!isEnabled || !web3 || !account.data) {
        return;
      }
      return web3.eth
        .getBalance(account.data)
        .then((balance) => web3.utils.fromWei(balance || "0"));
    },
    enabled: Boolean(
      isEnabled && !isPaliOnUtxo && account.isFetched && account.data
    ),
    refetchOnWindowFocus: false,
  });

  const chainId = useQuery(
    ["nevm", "chainId"],
    async () => window.ethereum.request({ method: "eth_chainId" }),
    {
      enabled: isEnabled && !isPaliOnUtxo && Boolean(account.data),
      refetchOnMount: true,
      refetchOnWindowFocus: false,
    }
  );
  const refetchChainId = chainId.refetch;
  const expectedChainId =
    normalizeEvmChainId(constants?.chain_id) ?? MAINNET_CHAIN_ID;
  const normalizedChainId = normalizeEvmChainId(chainId.data);
  const isExpectedChain = normalizedChainId === expectedChainId;
  const isWrongChain = Boolean(
    isEnabled &&
      normalizedChainId &&
      normalizedChainId !== expectedChainId
  );

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
        params: [{ chainId: expectedChainId }],
      })
      .then(() => chainId.refetch())
      .catch((err) => {
        const { code } = err;
        captureException(err);
        if (code === 4902) {
          // Create network params in EIP-3085 format with Pali wallet extensions
          const networkParams = {
            ...NEVMNetwork,
            chainId: expectedChainId,
            // Override with dynamic values from constants if available
            ...(constants && {
              rpcUrls: [constants.rpc.nevm],
              blockExplorerUrls: [constants.explorer.nevm],
              // Add apiUrl for Pali wallet (only for EVM networks)
              ...(constants.apiUrl.nevm && { apiUrl: constants.apiUrl.nevm }),
            }),
          };
          
          window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [networkParams],
          });
        }
      });
  };

  const connect = () => {
    const prePromise = account.data
      ? window.ethereum.request({
          method: "wallet_revokePermissions",
          params: [{ eth_accounts: {} }],
        })
      : Promise.resolve();

    void prePromise
      .then(() =>
        window.ethereum.request({
          method: getNevmAccountRequestMethod("connect"),
        })
      )
      .then(() => account.refetch())
      .catch((error) => {
        if (error?.code === 4001) {
          return;
        }
        console.error("Failed to connect EVM account:", error);
      });
  };

  const signMessage = (message: string): Promise<string> => {
    return window.ethereum.request({
      method: "personal_sign",
      params: [message, account.data],
    });
  };

  useEffect(() => {
    if (
      !isEnabled ||
      isPaliEvmProvider ||
      isPaliOnUtxo ||
      !window.ethereum?.on
    ) {
      return;
    }

    const ethereumProvider = window.ethereum as typeof window.ethereum & {
      removeListener?: (event: string, callback: () => void) => void;
      off?: (event: string, callback: () => void) => void;
    };
    const handleChainChanged = () => {
      void refetchChainId();
    };

    ethereumProvider.on("chainChanged", handleChainChanged);

    return () => {
      if (typeof ethereumProvider.removeListener === "function") {
        ethereumProvider.removeListener("chainChanged", handleChainChanged);
      } else if (typeof ethereumProvider.off === "function") {
        ethereumProvider.off("chainChanged", handleChainChanged);
      }
    };
  }, [isEnabled, isPaliEvmProvider, isPaliOnUtxo, refetchChainId]);

  return (
    <NEVMContext.Provider
      value={{
        account:
          isEnabled && account.isSuccess && account.data
            ? account.data
            : undefined,
        sendTransaction,
        balance: isEnabled ? balance.data : undefined,
        isTestnet: !!isTestnet,
        expectedChainId,
        isExpectedChain,
        isWrongChain,
        switchToMainnet,
        connect,
        chainId:
          isEnabled && chainId.isSuccess && chainId.data
            ? chainId.data
            : undefined,
        signMessage,
      }}
    >
      {children}
    </NEVMContext.Provider>
  );
};

export default NEVMProvider;
