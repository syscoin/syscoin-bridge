import { useNEVM } from "@contexts/ConnectedWallet/NEVMProvider";
import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import { useConstants } from "@contexts/useConstants";
import { Button } from "@mui/material";
import { isValidEthereumAddress } from "@sidhujag/sysweb3-utils";
import { useTransfer } from "./context/TransferContext";
import { useState } from "react";

type Props = {
  children: React.ReactNode;
};

const NEVMStepWrapper: React.FC<Props> = ({ children }) => {
  const { version, isBitcoinBased, switchTo, isEVMInjected } =
    usePaliWalletV2();

  const { constants } = useConstants();

  const { connect, account, chainId, switchToMainnet } = useNEVM();
  const { transfer } = useTransfer();
  const nevmAccount = account ?? transfer.nevmAddress ?? "";
  const hasNevmAccount = nevmAccount !== "";
  const [hasSwitched, setHasSwitched] = useState(false);

  // Only show switch button if we haven't switched yet and Pali is in UTXO mode
  if (version === "v2" && isBitcoinBased && isEVMInjected && !hasSwitched) {
    const handleSwitch = async () => {
      try {
        await switchTo("ethereum");
        // Mark as switched immediately - Pali has switched even if our state hasn't updated yet
        setHasSwitched(true);
      } catch (error) {
        console.error("Failed to switch to NEVM:", error);
      }
    };

    return (
      <Button variant="contained" onClick={handleSwitch}>
        Switch to Syscoin NEVM
      </Button>
    );
  }

  if (!hasNevmAccount) {
    return <Button onClick={connect}>Connect NEVM Wallet</Button>;
  }

  if (!isValidEthereumAddress(nevmAccount)) {
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
