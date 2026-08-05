import { useNEVM } from "@contexts/ConnectedWallet/NEVMProvider";
import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import { Alert, Button, Link, Typography } from "@mui/material";
import WalletSwitchCard from "./Card";
import WalletSwitchConfirmCard from "./ConfirmCard";
import { ITransfer } from "@contexts/Transfer/types";
import { useNevmBalance } from "utils/balance-hooks";
import { MIN_GAS_AMOUNT } from "@constants";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import { useConnectedWallet } from "@contexts/ConnectedWallet/useConnectedWallet";
import React from "react";

type NEVMConnectProps = {
  transfer: ITransfer;
  setNevm: (nevm: { address: string }) => void;
};

const minAmount = MIN_GAS_AMOUNT;

const NEVMConnect: React.FC<NEVMConnectProps> = ({ setNevm, transfer }) => {
  const {
    account,
    connect,
    expectedChainId,
    isWrongChain,
    switchToMainnet,
  } = useNEVM();
  const { isEnabled } = useFeatureFlags();
  const {
    changeAccount,
    isBitcoinBased,
    isEVMInjected,
    switchTo,
  } = usePaliWalletV2();
  const balance = useNevmBalance(transfer.nevmAddress);
  const { connectNEVM, nevm } = useConnectedWallet();

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

    isBitcoinBased ? switchTo("ethereum") : changeAccount(); 
  };

  const allowChange = transfer.status === "initialize";
  const hasNevmAddress = Boolean(transfer.nevmAddress);

  if (!expectedChainId) {
    return <Alert severity="error">NEVM network is not configured</Alert>;
  }
  
  // If the address is already set but the user switched to a wrong EVM chain, prompt to switch back
  if (hasNevmAddress && isWrongChain) {
    return (
      <Button variant="contained" onClick={switchToMainnet}>
        Switch to NEVM Network
      </Button>
    );
  }

  // Show the card with the selected address if we have a nevmAddress
  if (hasNevmAddress) {
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

  if (isWrongChain) {
    return (
      <Button variant="contained" onClick={switchToMainnet}>
        Switch to NEVM Network
      </Button>
    );
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
