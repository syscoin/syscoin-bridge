import {
  usePaliWallet,
  usePaliWalletV2,
} from "@contexts/PaliWallet/usePaliWallet";
import { useConstants } from "@contexts/useConstants";
import { Button } from "@mui/material";
import { isValidSYSAddress } from "@pollum-io/sysweb3-utils";

type UTXOStepWrapperProps = {
  children: React.ReactNode;
};

const UTXOStepWrapper: React.FC<UTXOStepWrapperProps> = ({ children }) => {
  const { constants } = useConstants();
  const { version, connectedAccount, connectWallet } = usePaliWallet();

  const { isBitcoinBased, switchTo, changeAccount } = usePaliWalletV2();

  if (version === "v2" && !isBitcoinBased) {
    return (
      <Button variant="contained" onClick={() => switchTo("bitcoin")}>
        Switch to Syscoin UTXO
      </Button>
    );
  }

  if (!connectedAccount) {
    return <Button onClick={connectWallet}>Connect Pali Wallet</Button>;
  }

  if (!isValidSYSAddress(connectedAccount, constants?.isTestnet ? 5700 : 57)) {
    return (
      <>
        <Button variant="contained" onClick={changeAccount}>
          Switch Account
        </Button>
      </>
    );
  }
  return <>{children}</>;
};

export default UTXOStepWrapper;
