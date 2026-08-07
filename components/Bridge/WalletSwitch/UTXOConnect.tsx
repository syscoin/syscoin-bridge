import { useUtxoBalance } from "utils/balance-hooks";
import { usePaliWallet, usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import { SYSX_ASSET_GUID } from "@contexts/Transfer/constants";
import { ITransfer } from "@contexts/Transfer/types";
import {
  Alert,
  Button,
  MenuItem,
  Select,
  SelectChangeEvent,
  Typography,
} from "@mui/material";
import React, { useEffect } from "react";
import WalletSwitchCard from "./Card";
import WalletSwitchConfirmCard from "./ConfirmCard";
import { MIN_GAS_AMOUNT } from "@constants";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import {
  connectPaliUtxoAccount,
  hasPaliUtxoAccountDetails,
  switchToSyscoinThenChangeAccount,
} from "@contexts/PaliWallet/utxo-network";

export type AssetType = "sys" | "sysx" | "none";

type UTXOConnectProps = {
  transfer: ITransfer;
  setUtxo: (utxo: { xpub: string; address: string }) => void;
  selectedAsset?: AssetType;
  setSelectedAsset?: (asset: AssetType) => void;
};

const minAmount = MIN_GAS_AMOUNT;

type ConnectedUtxoWalletProps = UTXOConnectProps & {
  change: () => void;
};

const ConnectedUtxoWallet: React.FC<ConnectedUtxoWalletProps> = ({
  transfer,
  setSelectedAsset,
  selectedAsset,
  change,
}) => {
  const balance = useUtxoBalance(transfer.utxoXpub!);
  const sysxBalance = useUtxoBalance(transfer.utxoXpub!, {
    address: transfer.utxoAddress,
    assetGuid: SYSX_ASSET_GUID,
    retry: false,
  });
  const allowChange = transfer.status === "initialize";
  let gasBalance = balance.data ?? 0;
  const { version } = usePaliWallet();
  const isV2 = version === "v2";
  const { isBitcoinBased, supportsPartialUtxoSigning } = usePaliWalletV2();
  const { isEnabled } = useFeatureFlags();
  if (isNaN(gasBalance)) {
    gasBalance = 0;
  }

  const utxoSponsorshipAvailable =
    isEnabled("foundationFundingAvailable") &&
    supportsPartialUtxoSigning &&
    (transfer.type === "nevm-to-sys" || transfer.utxoAssetType === "sysx");
  const faucetLink =
    balance.isFetched && gasBalance < minAmount && utxoSponsorshipAvailable ? (
      <Alert severity="info">
        <Typography variant="body2">
          The bridge will attempt to sponsor the destination-side UTXO fees. If
          sponsorship is unavailable, you will need SYS to continue.
        </Typography>
      </Alert>
    ) : balance.isFetched && gasBalance < minAmount ? (
      <Alert severity="warning">
        <Typography variant="body2">
          Please send at least {minAmount} SYS into your Pali wallet to continue
          the transaction
        </Typography>
      </Alert>
    ) : undefined;

  const handleChange = (event: SelectChangeEvent) => {
    if (!setSelectedAsset) {
      return;
    }
    setSelectedAsset(event.target.value as AssetType);
  };

  const sysBalanceText = balance.isLoading
    ? "Loading..."
    : `${balance.data?.toFixed(4)} SYS`;
  const sysxBalanceText = sysxBalance.isLoading
    ? "Loading..."
    : `${(sysxBalance.data ?? 0).toFixed(4)} SYSX`;

  useEffect(() => {
    if (
      !sysxBalance.isFetched ||
      !transfer.utxoAddress ||
      (isV2 && !isBitcoinBased)
    ) {
      return;
    }
    const emptySysxBalance =
      sysxBalance.data === undefined || sysxBalance.data === 0;

    const sysxIsInvalid = sysxBalance.isError || emptySysxBalance;

    if (
      (sysxIsInvalid || transfer.type === "nevm-to-sys") &&
      setSelectedAsset
    ) {
      setSelectedAsset("sys");
    }
  }, [
    sysxBalance.isError,
    setSelectedAsset,
    sysxBalance.data,
    sysxBalance.isFetched,
    transfer.utxoAddress,
    transfer.type,
    isBitcoinBased,
    isV2,
  ]);

  return (
    <WalletSwitchCard
      address={transfer.utxoAddress ?? ""}
      allowChange={allowChange}
      balance={
        transfer.type === "nevm-to-sys" || !sysxBalance.data ? (
          sysBalanceText
        ) : (
          <Select
            value={selectedAsset}
            onChange={handleChange}
            disabled={Boolean(faucetLink)}
          >
            <MenuItem value="none" disabled>
              Please select token
            </MenuItem>
            <MenuItem value="sys">{sysBalanceText}</MenuItem>
            <MenuItem value="sysx" disabled={!sysxBalance.data}>
              {sysxBalanceText}
            </MenuItem>
          </Select>
        )
      }
      onChange={change}
      faucetLink={faucetLink}
    />
  );
};

const UTXOConnectV1: React.FC<UTXOConnectProps> = (props) => {
  const { transfer, setUtxo } = props;
  const { connectedAccount, connectWallet, xpubAddress } = usePaliWallet();

  const setTransferUtxo = () => {
    if (!connectedAccount || !xpubAddress) return;
    setUtxo({ xpub: xpubAddress, address: connectedAccount });
  };

  if (!connectedAccount) {
    return <Button onClick={() => connectWallet()}>Connect</Button>;
  }

  if (!transfer.utxoAddress) {
    return (
      <WalletSwitchConfirmCard
        address={connectedAccount}
        onChange={connectWallet}
        onConfirm={setTransferUtxo}
      />
    );
  }

  return <ConnectedUtxoWallet {...props} change={connectWallet} />;
};

const UTXOConnect: React.FC<UTXOConnectProps> = (props) => {
  const { setUtxo, transfer } = props;
  const { version } = usePaliWallet();
  const isV2 = version === "v2";
  const {
    isBitcoinBased,
    switchTo,
    connectedAccount,
    xpubAddress,
    changeAccount,
    connectWallet,
  } = usePaliWalletV2();

  const setTransferUtxo = () => {
    if (!connectedAccount || !xpubAddress) return;
    setUtxo({ xpub: xpubAddress, address: connectedAccount });
  };

  const connect = () =>
    connectPaliUtxoAccount(
      connectedAccount,
      xpubAddress,
      switchTo,
      connectWallet
    );

  const change = () => {
    if (
      isBitcoinBased &&
      !hasPaliUtxoAccountDetails(connectedAccount, xpubAddress)
    ) {
      return connect();
    }

    return switchToSyscoinThenChangeAccount(
      isBitcoinBased,
      switchTo,
      changeAccount
    );
  };

  const hasUtxoAddress = Boolean(transfer.utxoAddress);

  if (!isV2) {
    return <UTXOConnectV1 {...props} />;
  }

  // Show the connected wallet card if we have a UTXO address
  if (hasUtxoAddress) {
    return <ConnectedUtxoWallet {...props} change={change} />;
  }

  if (!isBitcoinBased) {
    return (
      <Button variant="contained" onClick={() => switchTo("bitcoin")}>
        Set UTXO Account
      </Button>
    );
  }

  if (!hasPaliUtxoAccountDetails(connectedAccount, xpubAddress)) {
    return (
      <Button variant="contained" onClick={connect}>
        Connect Pali Wallet
      </Button>
    );
  }

  return (
    <WalletSwitchConfirmCard
      address={connectedAccount ?? ""}
      onChange={change}
      onConfirm={setTransferUtxo}
    />
  );
};

export default UTXOConnect;
