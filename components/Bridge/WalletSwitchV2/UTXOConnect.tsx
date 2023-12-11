import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import {
  Alert,
  Button,
  MenuItem,
  Select,
  SelectChangeEvent,
  Typography,
} from "@mui/material";
import WalletSwitchCard from "./Card";
import WalletSwitchConfirmCard from "./ConfirmCard";
import { ITransfer } from "@contexts/Transfer/types";
import { useUtxoBalance } from "utils/balance-hooks";
import { MIN_AMOUNT } from "@constants";
import { SYSX_ASSET_GUID } from "@contexts/Transfer/constants";
import { useEffect } from "react";

type AssetType = "sys" | "sysx" | "none";

type UTXOConnectProps = {
  transfer: ITransfer;
  setUtxo: (utxo: { xpub: string; address: string }) => void;
  selectedAsset?: AssetType;
  setSelectedAsset?: (asset: AssetType) => void;
};

const minAmount = MIN_AMOUNT;

const UTXOConnect: React.FC<UTXOConnectProps> = ({
  setUtxo,
  transfer,
  selectedAsset = "none",
  setSelectedAsset,
}) => {
  const balance = useUtxoBalance(transfer.utxoXpub!);

  const {
    isBitcoinBased,
    switchTo,
    connectedAccount,
    xpubAddress,
    changeAccount,
  } = usePaliWalletV2();

  const sysxBalance = useUtxoBalance(transfer.utxoXpub!, {
    address: transfer.utxoAddress,
    assetGuid: SYSX_ASSET_GUID,
    retry: false,
  });

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

  useEffect(() => {
    if (!sysxBalance.isFetched || !transfer.utxoAddress || !isBitcoinBased) {
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
  ]);

  if (
    isBitcoinBased && allowChange
      ? transfer.utxoAddress === connectedAccount
      : Boolean(transfer.utxoAddress)
  ) {
    let gasBalance = balance.data ?? 0;
    if (isNaN(gasBalance)) {
      gasBalance = 0;
    }

    const faucetLink =
      balance.isFetched && gasBalance < minAmount ? (
        <Alert severity="warning">
          <Typography variant="body2">
            Please send at least {minAmount} SYS into your Pali wallet to
            continue the transaction
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
