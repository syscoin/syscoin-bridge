import { useNEVM } from "@contexts/ConnectedWallet/NEVMProvider";
import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import { useTransfer } from "@contexts/Transfer/useTransfer";
import { Button } from "@mui/material";
import { useQuery } from "react-query";
import WalletSwitchCard from "./Card";
import WalletSwitchConfirmCard from "./ConfirmCard";

const NEVMConnect = () => {
  const { transfer, setNevm } = useTransfer();
  const { account, connect } = useNEVM();
  const { isBitcoinBased, switchTo, changeAccount } = usePaliWalletV2();
  const balance = useQuery(
    ["nevm", "balance", transfer.nevmAddress],
    async () => {
      const url = `https://explorer.syscoin.org/api?module=account&action=eth_get_balance&address=${transfer.nevmAddress}&tag=latest`;
      const ethBalanceInHex = await fetch(url)
        .then((res) => res.json())
        .then((rpcResp) => rpcResp.result);
      const ethBalance = parseInt(ethBalanceInHex) / Math.pow(10, 18);
      return ethBalance;
    }
  );

  const setTransferNevm = () => {
    if (!account) return;
    setNevm({ address: account });
  };

  const change = () => {
    const prom = isBitcoinBased ? switchTo("ethereum") : Promise.resolve();
    setNevm({ address: "" });
    prom.then(() => changeAccount());
  };

  if (
    !isBitcoinBased
      ? transfer.nevmAddress === account
      : Boolean(transfer.nevmAddress)
  ) {
    return (
      <WalletSwitchCard
        address={transfer.nevmAddress ?? ""}
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

  if (isBitcoinBased) {
    return (
      <Button variant="contained" onClick={() => switchTo("ethereum")}>
        Set NEVM
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
