import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { UTXOTransaction } from "syscoinjs-lib";
import { utils as syscoinUtils } from "syscoinjs-lib";
import { PaliWallet } from "./types";
import { captureException } from "@sentry/nextjs";

const tenMinutes = 10 * 60 * 1000;

interface ConnectionsController {
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  getConnectedAccount: () => Promise<PaliWallet.Account>;
  onWalletUpdate: (fn: () => Promise<any>) => Promise<any>;
  getConnectedAccountXpub: () => Promise<string>;
  signAndSend: (psbt: UTXOTransaction) => Promise<UTXOTransaction>;
  signPSBT: (psbt: UTXOTransaction) => Promise<UTXOTransaction>;
  getWalletState: () => Promise<PaliWallet.WalletState>;
  isLocked: () => Promise<boolean>;
}

declare global {
  interface Window {
    SyscoinWallet?: string;
    ConnectionsController?: ConnectionsController;
  }
}

export interface IPaliWalletContext {
  isInstalled?: boolean;
  connectedAccount?: string;
  xpubAddress?: string;
  connectWallet: () => void;
  balance: number | undefined;
  sendTransaction: (
    transaction: UTXOTransaction
  ) => Promise<{ tx: string; error?: any }>;
  isTestnet: boolean;
  version: "v1" | "v2";
}

export const PaliWalletContext = createContext({} as IPaliWalletContext);

const PaliWalletContextProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [controller, setController] = useState<ConnectionsController>();
  const [isInstalled, setIsInstalled] = useState<boolean>();
  const [xpubAddress, setXpubAddress] = useState<string>();
  const [walletState, setWalletState] = useState<PaliWallet.WalletState>();
  const [isOnWalletUpdateSet, setIsOnWalletUpdateSet] = useState(false);

  const connectedAccount = useMemo(() => {
    if (!walletState || !xpubAddress) {
      return undefined;
    }
    return walletState.accounts.find((account) => account.xpub === xpubAddress)
      ?.address.main;
  }, [walletState, xpubAddress]);
  const balance = useMemo(() => {
    if (!walletState || !xpubAddress) {
      return undefined;
    }
    return (
      walletState.accounts.find((account) => account.xpub === xpubAddress)
        ?.balance ?? 0
    );
  }, [walletState, xpubAddress]);

  const sendTransaction = async (transaction: UTXOTransaction) => {
    const windowController = loadWindowController();
    if (!windowController) {
      return Promise.reject("No controller");
    }
    const isLocked = await windowController.isLocked();
    if (isLocked) {
      connectWallet();
      await new Promise((resolve, reject) => {
        let retryCount = 10;
        const interval = setInterval(async () => {
          if (retryCount-- <= 0) {
            clearInterval(interval);
            reject("Failed to connect");
          }
          const isLocked = await windowController.isLocked();
          if (!isLocked) {
            clearInterval(interval);
            resolve(true);
          }
        }, 1000);
      });
    }
    if (!connectedAccount) {
      const account = await windowController.getConnectedAccount();
      if (account === null) {
        console.log("Wallet not found");
        await connectWallet();
      }
    }
    console.log("Sending transaction", transaction, new Date());
    const signedTransaction = await windowController
      .signAndSend(transaction)
      .catch((sendTransactionError) => {
        captureException(sendTransactionError);
        console.error("PaliWallet Sendtransaction", { sendTransactionError });
        return Promise.reject(sendTransactionError);
      });
    console.log("Confirmed transaction", signedTransaction, new Date());
    const unserializedResp = syscoinUtils.importPsbtFromJson(
      signedTransaction,
      syscoinUtils.syscoinNetworks.mainnet
    );
    return {
      tx: unserializedResp.psbt.extractTransaction().getId(),
      error: null,
    };
  };

  const loadWindowController = useCallback(() => {
    if (controller) {
      return controller;
    }
    console.log("controller is set");
    const windowController = window.ConnectionsController!;
    setController(controller);
    if (!isOnWalletUpdateSet) {
      windowController.onWalletUpdate(async () => {
        console.log("wallet updated");
        const xpubAddress = await windowController.getConnectedAccountXpub();
        const walletState = await windowController.getWalletState();
        setXpubAddress(xpubAddress);
        setWalletState(walletState);
      });
      setIsOnWalletUpdateSet(true);
    }
    return windowController;
  }, [controller, setController, isOnWalletUpdateSet, setIsOnWalletUpdateSet]);

  const connectWallet = () => {
    const windowController = loadWindowController();
    if (!windowController) {
      return;
    }
    return windowController.connectWallet();
  };

  useEffect(() => {
    if (controller) {
      return;
    }

    const callback = (event: any) => {
      if (event.detail.SyscoinInstalled) {
        setIsInstalled(true);
        console.log("syscoin is installed");

        if (
          event.detail.ConnectionsController &&
          window.ConnectionsController
        ) {
          loadWindowController();
          return;
        }
        return;
      }

      window.removeEventListener("SyscoinStatus", callback);
    };

    console.log("checking syscoin status");

    window.addEventListener("SyscoinStatus", callback);

    const check = setInterval(() => {
      if (window.ConnectionsController) {
        setIsInstalled(true);
        console.log("syscoin is installed");
        loadWindowController();
        clearInterval(check);
      }
    }, 100);

    setTimeout(() => {
      if (!window.ConnectionsController) {
        setIsInstalled(false);
      }
      clearInterval(check);
    }, 10000);
  }, [controller, loadWindowController]);

  return (
    <PaliWalletContext.Provider
      value={{
        isInstalled,
        connectedAccount,
        connectWallet,
        xpubAddress,
        sendTransaction,
        balance,
        isTestnet: walletState?.activeNetwork !== "main",
        version: "v1",
      }}
    >
      {children}
    </PaliWalletContext.Provider>
  );
};

export default PaliWalletContextProvider;
