import { useNEVM } from "@contexts/ConnectedWallet/NEVMProvider";
import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import { useTransfer } from "@contexts/Transfer/useTransfer";

const NEVMConnect = () => {
  const { transfer, setNevm } = useTransfer();
  const { account, connect } = useNEVM();
  const { isBitcoinBased, switchTo } = usePaliWalletV2();

  const setTransferNevm = () => {
    if (!account) return;
    setNevm({ address: account });
  };

  if (transfer.nevmAddress) {
    return (
      <div>
        <span>{transfer.nevmAddress}</span>
      </div>
    );
  }

  if (isBitcoinBased) {
    return <button onClick={() => switchTo("ethereum")}>Switch to NEVM</button>;
  }

  if (!account) {
    return <button onClick={() => connect()}>Fetch account</button>;
  }

  return (
    <div>
      <span>{account}</span>
      <button onClick={setTransferNevm}>Set</button>
    </div>
  );
};

export default NEVMConnect;
