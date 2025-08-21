import { useNEVM } from "@contexts/ConnectedWallet/NEVMProvider";
import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import { useConstants } from "@contexts/useConstants";
import { Button } from "@mui/material";
import { isValidEthereumAddress } from "@sidhujag/sysweb3-utils";

type Props = {
  children: React.ReactNode;
};

const NEVMStepWrapper: React.FC<Props> = ({ children }) => {
  const { version, isBitcoinBased, switchTo, isEVMInjected } =
    usePaliWalletV2();

  const { constants } = useConstants();

  const { connect, account, chainId, switchToMainnet } = useNEVM();

  if (version === "v2" && isBitcoinBased && isEVMInjected) {
    return (
      <Button variant="contained" onClick={() => switchTo("ethereum")}>
        Switch to Syscoin NEVM
      </Button>
    );
  }

  if (!account) {
    return <Button onClick={connect}>Connect NEVM Wallet</Button>;
  }

  if (!isValidEthereumAddress(account)) {
    return (
      <>
        <Button variant="contained" onClick={connect}>
          Switch Account
        </Button>
      </>
    );
  }

  if (chainId !== constants?.chain_id) {
    return (
      <Button variant="contained" onClick={switchToMainnet}>
        Switch to NEVM Network
      </Button>
    );
  }
  return <>{children}</>;
};

export default NEVMStepWrapper;
