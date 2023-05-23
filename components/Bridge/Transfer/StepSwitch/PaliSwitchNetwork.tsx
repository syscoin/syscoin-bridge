import { useNEVM } from "@contexts/ConnectedWallet/NEVMProvider";
import { IPaliWalletV2Context } from "@contexts/PaliWallet/V2Provider";
import { usePaliWallet } from "@contexts/PaliWallet/usePaliWallet";
import { useTransfer } from "@contexts/Transfer/useTransfer";
import { Alert, Button } from "@mui/material";
import { useEffect } from "react";
import { useQueryClient } from "react-query";

type Props = {
  networkType: "bitcoin" | "ethereum";
};

const PaliSwitch: React.FC<Props> = ({ networkType }) => {
  const { proceedNextStep } = useTransfer();
  const queryClient = useQueryClient();
  const { account } = useNEVM();
  const { switchTo, connectedAccount } =
    usePaliWallet() as IPaliWalletV2Context;

  let networkName = "unknown";
  if (networkType === "bitcoin") {
    networkName = "Syscoin";
  } else if (networkType === "ethereum") {
    networkName = "NEVM";
  }

  const switchNetwork = () => {
    switchTo(networkType).then(() => {
      if (networkType === "bitcoin") {
        queryClient.invalidateQueries(["pali", "connected-account"]);
      } else if (networkType === "ethereum") {
        queryClient.invalidateQueries(["nevm"]);
      }
    });
  };

  if (
    (networkType === "ethereum" && account) ||
    (networkType === "bitcoin" && connectedAccount)
  ) {
    return <Button onClick={proceedNextStep}>Continue</Button>;
  }

  return <Button onClick={switchNetwork}>Switch to {networkName}</Button>;
};

export default PaliSwitch;
