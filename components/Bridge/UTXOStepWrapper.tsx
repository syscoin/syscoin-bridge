import {
  usePaliWallet,
  usePaliWalletV2,
} from "@contexts/PaliWallet/usePaliWallet";
import { useConstants } from "@contexts/useConstants";
import { Button } from "@mui/material";
import { isValidSYSAddress } from "@sidhujag/sysweb3-utils";
import {
  getSyscoinChainId,
  resolveSyscoinIsTestnet,
} from "utils/network-config";

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

  if (
    !isValidSYSAddress(
      connectedAccount,
      getSyscoinChainId(resolveSyscoinIsTestnet(constants))
    )
  ) {
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
