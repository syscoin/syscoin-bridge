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

  const sysxBalance = useUtxoBalance(
    transfer.utxoXpub!,
    transfer.utxoAddress,
    SYSX_ASSET_GUID
  );

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

    return (
      <WalletSwitchCard
        address={transfer.utxoAddress ?? ""}
        allowChange={allowChange}
        balance={
          <Select
            value={selectedAsset}
            onChange={handleChange}
            disabled={Boolean(faucetLink)}
          >
            <MenuItem value="none" disabled>
              Please select token
            </MenuItem>
            <MenuItem value="sys">
              {balance.isLoading
                ? "Loading..."
                : `${balance.data?.toFixed(4)} SYS`}
            </MenuItem>
            <MenuItem value="sysx" disabled={!sysxBalance.data}>
              {sysxBalance.isLoading
                ? "Loading..."
                : `${(sysxBalance.data ?? 0).toFixed(4)} SYSX`}
            </MenuItem>
          </Select>
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
