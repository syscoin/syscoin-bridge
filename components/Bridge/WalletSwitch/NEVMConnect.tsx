import { useNEVM } from "@contexts/ConnectedWallet/NEVMProvider";
import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import { Alert, Button, Link, Typography } from "@mui/material";
import WalletSwitchCard from "./Card";
import WalletSwitchConfirmCard from "./ConfirmCard";
import { ITransfer } from "@contexts/Transfer/types";
import { useNevmBalance } from "utils/balance-hooks";
import { MIN_AMOUNT } from "@constants";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import { useConnectedWallet } from "@contexts/ConnectedWallet/useConnectedWallet";
import React from "react";

type NEVMConnectProps = {
  transfer: ITransfer;
  setNevm: (nevm: { address: string }) => void;
};

const minAmount = MIN_AMOUNT;

const NEVMConnect: React.FC<NEVMConnectProps> = ({ setNevm, transfer }) => {
  const { account, connect } = useNEVM();
  const { isEnabled } = useFeatureFlags();
  const {
    changeAccount,
    isBitcoinBased,
    isEVMInjected,
    switchTo,
  } = usePaliWalletV2();
  const balance = useNevmBalance(transfer.nevmAddress);
  const { connectNEVM, nevm } = useConnectedWallet();

  // Use a ref to always have the current address for comparison
  const currentAddressRef = React.useRef(transfer.nevmAddress);
  React.useEffect(() => {
    currentAddressRef.current = transfer.nevmAddress;
  }, [transfer.nevmAddress]);

  // Listen for account changes when component is mounted
  React.useEffect(() => {
    if (!isEVMInjected || !window.ethereum) return;

    // Listen for standard ethereum accountsChanged events
    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length > 0 && accounts[0] !== currentAddressRef.current) {
        // Account changed, update the state
        setNevm({ address: accounts[0] });
      }
    };

    // Also listen for Pali's raw notification events
    const handlePaliNotification = (event: any) => {
      try {
        const eventData = JSON.parse(event.detail);
        
        // Check both data and direct properties
        const data = eventData.data || eventData;
        
        if (data?.method === 'pali_accountsChanged' && data?.params) {
          const params = Array.isArray(data.params) ? data.params : [data.params];
          if (params.length > 0 && params[0] && params[0] !== currentAddressRef.current) {
            setNevm({ address: params[0] });
          }
        }
      } catch (error) {
        // Silently ignore parsing errors
      }
    };

    // Listen for both types of events
    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.addEventListener('paliNotification', handlePaliNotification);
    
    return () => {
      // Cleanup listeners
      if (typeof (window.ethereum as any).removeListener === 'function') {
        (window.ethereum as any).removeListener('accountsChanged', handleAccountsChanged);
      } else if (typeof (window.ethereum as any).off === 'function') {
        (window.ethereum as any).off('accountsChanged', handleAccountsChanged);
      }
      window.removeEventListener('paliNotification', handlePaliNotification);
    };
  }, [isEVMInjected, setNevm]); // Removed transfer.nevmAddress to prevent re-runs

  const setTransferNevm = () => {
    if (!account) return;
    setNevm({ address: account });
  };

  const change = () => {
    setNevm({ address: "" });
    if (nevm.type === "metamask") {
      connectNEVM("metamask");
      return;
    }

    const prom = isBitcoinBased ? switchTo("ethereum") : Promise.resolve();
    prom.then(() => changeAccount());
  };

  const allowChange = transfer.status === "initialize";
  if (
    !isBitcoinBased && allowChange
      ? transfer.nevmAddress === account
      : Boolean(transfer.nevmAddress)
  ) {
    let balanceNum = balance.data ?? 0;
    if (isNaN(balanceNum)) {
      balanceNum = 0;
    }
    const foundationFundingAvailable =
      isEnabled("foundationFundingAvailable") &&
      transfer.type === "sys-to-nevm";
    const faucetLink =
      balance.isFetched &&
      balanceNum < minAmount &&
      !foundationFundingAvailable ? (
        <Alert severity="warning">
          <Typography variant="body2">
            You don&apos;t have enough balance. Please go to&nbsp;
            <Link href="https://faucet.syscoin.org/" target="_blank">
              Faucet
            </Link>
          </Typography>
        </Alert>
      ) : undefined;
    return (
      <WalletSwitchCard
        address={transfer.nevmAddress ?? ""}
        allowChange={allowChange}
        balance={
          balance.isLoading ? "Loading..." : `${balanceNum?.toFixed(4)} SYS`
        }
        onChange={change}
        faucetLink={faucetLink}
      />
    );
  }

  if (isBitcoinBased && isEVMInjected) {
    return (
      <Button variant="contained" onClick={() => switchTo("ethereum")}>
        Set NEVM Account
      </Button>
    );
  }

  if (!account) {
    return <Button onClick={() => connect()}>Fetch account</Button>;
  }

  return (
    <WalletSwitchConfirmCard
      address={account ?? ""}
      onChange={change}
      onConfirm={setTransferNevm}
    />
  );
};

export default NEVMConnect;
