import { useNEVM } from "@contexts/ConnectedWallet/NEVMProvider";
import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import { Button } from "@mui/material";
import {
  isValidEthereumAddress,
  isValidSYSAddress,
} from "@pollum-io/sysweb3-utils";

type Props = {
  children: React.ReactNode;
};

const NEVMStepWrapper: React.FC<Props> = ({ children }) => {
  const { version, isBitcoinBased, switchTo, isEVMInjected, connectWallet } =
    usePaliWalletV2();

  const { connect, account } = useNEVM();

  if (version === "v2" && isBitcoinBased && isEVMInjected) {
    return (
      <Button variant="contained" onClick={() => switchTo("ethereum")}>
        Switch to NEVM
      </Button>
    );
  }

  if (!account) {
    return <Button onClick={connectWallet}>Connect Pali Wallet</Button>;
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
  return <>{children}</>;
};

export default NEVMStepWrapper;
