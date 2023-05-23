import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import { useTransfer } from "@contexts/Transfer/useTransfer";

const UTXOConnect = () => {
  const { transfer, setUtxo } = useTransfer();
  const { isBitcoinBased, switchTo, connectedAccount, xpubAddress } =
    usePaliWalletV2();

  const setTransferUtxo = () => {
    if (!connectedAccount || !xpubAddress) return;
    setUtxo({ xpub: xpubAddress, address: connectedAccount });
  };

  if (transfer.utxoXpub) {
    return (
      <div>
        <span>{transfer.utxoAddress}</span>
      </div>
    );
  }

  if (!isBitcoinBased) {
    return (
      <button onClick={() => switchTo("bitcoin")}>
        Switch to Syscoin Core
      </button>
    );
  }

  return (
    <div>
      <span>{connectedAccount}</span>
      <button onClick={setTransferUtxo}>Set</button>
    </div>
  );
};

export default UTXOConnect;
