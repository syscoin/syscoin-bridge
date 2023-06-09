import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import { useTransfer } from "@contexts/Transfer/useTransfer";
import { Button } from "@mui/material";
import { useQuery } from "react-query";
import { BlockbookAPIURL } from "@contexts/Transfer/constants";
import WalletSwitchCard from "./Card";
import WalletSwitchConfirmCard from "./ConfirmCard";

const UTXOConnect = () => {
  const { transfer, setUtxo } = useTransfer();
  const balance = useQuery(
    ["utxo", "balance", transfer.utxoXpub],
    async () => {
      const url = BlockbookAPIURL + "/api/v2/xpub/" + transfer.utxoXpub;
      const balanceInText = await fetch(url)
        .then((res) => res.json())
        .then((res) => res.balance);
      return parseInt(balanceInText) / Math.pow(10, 8);
    },
    {
      enabled: Boolean(transfer.utxoXpub),
    }
  );
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

  if (
    isBitcoinBased
      ? transfer.utxoAddress === connectedAccount
      : Boolean(transfer.utxoAddress)
  ) {
    return (
      <WalletSwitchCard
        address={transfer.utxoAddress ?? ""}
        allowChange={transfer.status === "initialize"}
        balance={
          balance.isLoading
            ? "Loading..."
            : `${(isNaN(balance.data ?? 0) ? 0 : balance.data)?.toFixed(4)} SYS`
        }
        onChange={change}
      />
    );
  }

  if (!isBitcoinBased) {
    return (
      <Button variant="contained" onClick={() => switchTo("bitcoin")}>
        Set Syscoin Core
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
