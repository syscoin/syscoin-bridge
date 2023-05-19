import { IPaliWalletV2Context } from "@contexts/PaliWallet/V2Provider";
import { usePaliWallet } from "@contexts/PaliWallet/usePaliWallet";
import { useTransfer } from "@contexts/Transfer/useTransfer";
import { Alert, Button } from "@mui/material";
import { useEffect } from "react";

type Props = {
  networkType: "bitcoin" | "ethereum";
};

const PaliSwitch: React.FC<Props> = ({ networkType }) => {
  const {  } = useTransfer();
  const { switchTo, isBitcoinBased } = usePaliWallet() as IPaliWalletV2Context;

  let networkName = "unknown";
  if (networkType === "bitcoin") {
    networkName = "Syscoin";
  } else if (networkType === "ethereum") {
    networkName = "NEVM";
  }

  useEffect(() => {
    if (
      (isBitcoinBased && networkType === "ethereum") ||
      (!isBitcoinBased && networkType === "bitcoin")
    ) {

    }
  }, [isBitcoinBased, networkType]);

  return (
    <Button onClick={() => switchTo(networkType)}>
      Switch to {networkName}
    </Button>
  );
};

export default PaliSwitch;
