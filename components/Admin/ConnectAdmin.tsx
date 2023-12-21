import { useNEVM } from "@contexts/ConnectedWallet/NEVMProvider";
import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import { Button } from "@mui/material";

const ConnectAdmin = () => {
  const { account, connect } = useNEVM();
  const { isBitcoinBased, isEVMInjected, switchTo } = usePaliWalletV2();

  const isConnected = Boolean(account);

  return (
    <>
      {!isConnected && !isBitcoinBased && (
        <Button onClick={connect}>Connect</Button>
      )}
      {isBitcoinBased && isEVMInjected && (
        <Button onClick={() => switchTo("ethereum")}>Switch to NEVM</Button>
      )}
    </>
  );
};

export default ConnectAdmin;
