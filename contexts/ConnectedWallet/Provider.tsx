import { BlockbookAPIURL } from "@contexts/Transfer/constants";
import {
  createContext,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { syscoin, utils as syscoinUtils, UTXOTransaction } from "syscoinjs-lib";

import { usePaliWallet, usePaliWalletV2 } from "../PaliWallet/usePaliWallet";
import { UTXOInfo, NEVMInfo, UTXOWallet, NEVMWallet } from "./types";
import Web3 from "web3";
import { TransactionReceipt } from "web3-core";
import { useRouter } from "next/router";
import { useNEVM } from "./NEVMProvider";
import { useMetamask } from "@contexts/Metamask/Provider";

export type SendUtxoTransaction = (
  transaction: UTXOTransaction
) => Promise<{ tx: string; error?: any }>;

interface IConnectedWalletContext {
  utxo: Partial<UTXOInfo>;
  nevm: Partial<NEVMInfo>;
  connectUTXO: (type: UTXOWallet) => void;
  connectNEVM: (type: NEVMWallet) => void;
  sendUtxoTransaction: SendUtxoTransaction;
  availableWallets: {
    paliWallet?: boolean;
    metamask: boolean;
  };
  confirmTransaction: (
    chain: "nevm" | "utxo",
    transactionId: string,
    duration?: number,
    confirmations?: number
  ) => Promise<syscoinUtils.BlockbookTransactionBTC | TransactionReceipt>;
  syscoinInstance: syscoin;
  web3: Web3;
}

export const ConnectedWalletContext = createContext(
  {} as IConnectedWalletContext
);

const ConnectedWalletProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { route } = useRouter();
  const [oldRoute, setOldRoute] = useState<string>();
  const [createdIntervals, setCreatedIntervals] = useState<NodeJS.Timer[]>([]);
  const syscoinInstance = useMemo(
    () =>
      new syscoin(null, BlockbookAPIURL, syscoinUtils.syscoinNetworks.mainnet),
    []
  );
  const web3 = useMemo(() => new Web3(Web3.givenProvider), []);
  const paliWallet = usePaliWalletV2();
  const metamask = useMetamask();
  const [utxoWalletType, setUtxoWalletType] =
    useState<UTXOWallet>("pali-wallet");
  const [nevmWalletType, setNevmWalletType] = useState<NEVMWallet>(
    paliWallet.version === "v2" && paliWallet.isEVMInjected
      ? "pali-wallet"
      : "metamask"
  );
  const nevm = useNEVM();

  const utxoAccount = paliWallet.connectedAccount;
  const nevmAccount = nevm.account;

  const connectUTXO = (type: UTXOWallet = "pali-wallet") => {
    if (type === "pali-wallet") {
      paliWallet.connectWallet();
    }
    setUtxoWalletType(type);
  };

  const connectNEVM = (type: NEVMWallet) => {
    if (type === "metamask") {
      nevm.connect();
    }
    setNevmWalletType(
      window.ethereum.wallet === "pali-v2" ? "pali-wallet" : "metamask"
    );
  };

  const sendUtxoTransaction: SendUtxoTransaction = (
    transaction: UTXOTransaction
  ) => {
    if (utxoWalletType === "pali-wallet") {
      return paliWallet.sendTransaction(transaction);
    }
    return Promise.reject(new Error("Wallet not connected"));
  };

  const confirmTransaction = useCallback(
    (
      chain: "nevm" | "utxo",
      transactionId: string,
      durationInSeconds = 0,
      confirmationsNeeded = 1
    ): Promise<syscoinUtils.BlockbookTransactionBTC | TransactionReceipt> => {
      if (chain === "utxo") {
        return new Promise((resolve, reject) => {
          const expiry = Date.now() + durationInSeconds;
          let isRequesting = false;
          const interval = setInterval(async () => {
            if (durationInSeconds !== 0 && Date.now() > expiry) {
              clearInterval(interval);
              reject(new Error("Confirm transaction timed out"));
            }
            if (isRequesting) {
              return;
            }
            isRequesting = true;
            const transaction = await syscoinUtils
              .fetchBackendRawTx(BlockbookAPIURL, transactionId)
              .catch((error) => {
                isRequesting = false;
                clearInterval(interval);
                reject(
                  new Error("Confirm transaction failed", { cause: error })
                );
              });
            isRequesting = false;
            if (!transaction) {
              return;
            }
            if (transaction.confirmations >= confirmationsNeeded) {
              setTimeout(() => {
                clearInterval(interval);
                resolve(transaction);
              }, 2000);
            }
          }, 2000);
          setCreatedIntervals(createdIntervals.concat(interval));
        });
      }
      return new Promise((resolve, reject) => {
        const expiry = Date.now() + durationInSeconds;
        let isRequesting = false;
        const interval = setInterval(async () => {
          if (durationInSeconds !== 0 && Date.now() > expiry) {
            clearInterval(interval);
            reject(new Error("Confirm transaction timed out"));
          }
          if (isRequesting) {
            return;
          }
          isRequesting = true;
          const receipt = await web3.eth
            .getTransactionReceipt(transactionId)
            .catch((error) => {
              isRequesting = false;
              clearInterval(interval);
              reject(new Error("Confirm transaction failed", { cause: error }));
            });
          isRequesting = false;
          if (!receipt) {
            return;
          }
          if (receipt.status === true) {
            clearInterval(interval);
            resolve(receipt);
          }
          if (Date.now() > expiry) {
            clearInterval(interval);
            reject(new Error("Confirm transaction timed out"));
          }
        }, 1000);
        setCreatedIntervals(createdIntervals.concat(interval));
      });
    },
    [createdIntervals, web3.eth]
  );

  useEffect(() => {
    if (oldRoute === route) {
      return;
    }
    createdIntervals.forEach((interval) => clearInterval(interval));
    setOldRoute(route);
    setCreatedIntervals([]);
  }, [createdIntervals, route, oldRoute]);

  useEffect(() => {
    if (!window.ethereum) {
      return;
    }
    setNevmWalletType(
      window.ethereum.wallet === "pali-v2" ? "pali-wallet" : "metamask"
    );
  }, [paliWallet.isEVMInjected, setNevmWalletType]);

  return (
    <ConnectedWalletContext.Provider
      value={{
        nevm: {
          type: nevmWalletType,
          account: nevmAccount,
          balance: nevm.balance,
        },
        utxo: {
          type: utxoWalletType,
          account: utxoAccount,
          xpub: paliWallet.xpubAddress,
          balance: paliWallet.balance,
        },
        connectNEVM,
        connectUTXO,
        sendUtxoTransaction,
        availableWallets: {
          paliWallet: paliWallet.isInstalled,
          metamask: metamask.isEnabled,
        },
        confirmTransaction,
        syscoinInstance,
        web3,
      }}
    >
      {children}
    </ConnectedWalletContext.Provider>
  );
};

export default ConnectedWalletProvider;
