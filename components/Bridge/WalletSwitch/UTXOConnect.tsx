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
import { MIN_AMOUNT } from "@constants";

export type AssetType = "sys" | "sysx" | "none";

type UTXOConnectProps = {
  transfer: ITransfer;
  setUtxo: (utxo: { xpub: string; address: string }) => void;
  selectedAsset?: AssetType;
  setSelectedAsset?: (asset: AssetType) => void;
};

const minAmount = MIN_AMOUNT;

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
  const { isBitcoinBased } = usePaliWalletV2();
  if (isNaN(gasBalance)) {
    gasBalance = 0;
  }

  const faucetLink =
    balance.isFetched && gasBalance < minAmount ? (
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
    return <Button onClick={connectWallet}>Connect</Button>;
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
  const { setUtxo, transfer, setSelectedAsset } = props;
  const sysxBalance = useUtxoBalance(transfer.utxoXpub!, {
    address: transfer.utxoAddress,
    assetGuid: SYSX_ASSET_GUID,
    retry: false,
  });
  const { version } = usePaliWallet();
  const isV2 = version === "v2";
  const {
    isBitcoinBased,
    switchTo,
    connectedAccount,
    xpubAddress,
    changeAccount,
  } = usePaliWalletV2();

  const setTransferUtxo = () => {
    if (!connectedAccount || !xpubAddress) return;
    setUtxo({ xpub: xpubAddress, address: connectedAccount });
  };

  const change = () => {
    const prom = !isBitcoinBased ? switchTo("bitcoin") : Promise.resolve();
    setUtxo({ xpub: "", address: "" });
    prom.then(() => changeAccount());
  };

  const allowChange = transfer.status === "initialize";

  if (!isV2) {
    return <UTXOConnectV1 {...props} />;
  }

  if (
    isBitcoinBased && allowChange
      ? transfer.utxoAddress === connectedAccount
      : Boolean(transfer.utxoAddress)
  ) {
    return <ConnectedUtxoWallet {...props} change={change} />;
  }

  if (!isBitcoinBased) {
    return (
      <Button variant="contained" onClick={() => switchTo("bitcoin")}>
        Set UTXO Account
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
