import { useNEVM } from "@contexts/ConnectedWallet/NEVMProvider";
import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import { Button, Stack } from "@mui/material";
import { useConstants } from "@contexts/useConstants";

const ConnectAdmin = () => {
  const { account, connect, isWrongChain, switchToMainnet } = useNEVM();
  const { isBitcoinBased, isEVMInjected, switchTo } = usePaliWalletV2();
  const { constants } = useConstants();

  const isConnected = Boolean(account);
  const networkName = constants?.isTestnet
    ? "Tanenbaum NEVM"
    : "Syscoin NEVM Mainnet";

  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
      {!isConnected && !isBitcoinBased && (
        <Button variant="contained" onClick={connect}>
          Connect NEVM wallet
        </Button>
      )}
      {isBitcoinBased && isEVMInjected && (
        <Button variant="contained" onClick={() => switchTo("ethereum")}>
          Switch Pali to NEVM
        </Button>
      )}
      {isConnected && isWrongChain && (
        <Button variant="contained" onClick={switchToMainnet}>
          Switch to {networkName}
        </Button>
      )}
      {isConnected && (
        <Button variant="outlined" onClick={connect}>
          Use another wallet
        </Button>
      )}
    </Stack>
  );
};

export default ConnectAdmin;
