import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { TransactionConfig, provider } from "web3-core";
import Web3 from "web3";
import { NEVMNetwork } from "../Transfer/constants";
import { useQuery } from "react-query";
import { useMetamask } from "@contexts/Metamask/Provider";
import { usePaliWallet } from "@contexts/PaliWallet/usePaliWallet";
import { IPaliWalletV2Context } from "@contexts/PaliWallet/V2Provider";

interface INEVMContext {
  account?: string;
  balance?: string;
  requestAccounts: () => void;
  sendTransaction: (transactionConfig: TransactionConfig) => Promise<string>;
  fetchBalance: () => void;
  isTestnet: boolean;
  switchToMainnet: () => void;
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
  const [account, setAccount] = useState<string | undefined>();
  const [balance, setBalance] = useState<string>();
  const { data: isTestnet } = useQuery(
    ["nevm", "isTestnet"],
    () => window?.ethereum?.networkVersion !== parseInt("0x39", 16).toString(),
    {
      enabled: isEnabled,
      refetchInterval: 1000,
    }
  );

  const handleAccounstChange = (accounts: string[]) => {
    if (accounts.length > 0) {
      setAccount(accounts[0]);
    }
  };

  const fetchBalance = useCallback(() => {
    if (!isEnabled || !web3 || !account) {
      return;
    }

    // check if account is valid address
    if (!web3.utils.isAddress(account)) {
      return;
    }

    web3.eth.getBalance(account).then((balance) => {
      setBalance(web3.utils.fromWei(balance || "0"));
    });
  }, [web3, account, isEnabled]);

  const requestAccounts = () => {
    window.ethereum
      .request({
        method: "eth_requestAccounts",
      })
      .then((accounts) => handleAccounstChange(accounts as string[]));
    window.ethereum.on("accountsChanged", handleAccounstChange);
  };

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

  useEffect(() => {
    if (!isEnabled) {
      return;
    }
    if (window.ethereum.selectedAddress) {
      setAccount(window.ethereum.selectedAddress);
    }
  }, [isEnabled]);

  useEffect(() => {
    if (!isEnabled) {
      return;
    }
    fetchBalance();
  }, [isEnabled, account, fetchBalance]);

  return (
    <NEVMContext.Provider
      value={{
        account,
        requestAccounts,
        sendTransaction,
        balance,
        fetchBalance,
        isTestnet: !!isTestnet,
        switchToMainnet,
      }}
    >
      {children}
    </NEVMContext.Provider>
  );
};

export default NEVMProvider;
