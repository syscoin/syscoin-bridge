import { useNEVM } from "@contexts/ConnectedWallet/NEVMProvider";
import { IPaliWalletV2Context } from "@contexts/PaliWallet/V2Provider";
import {
  usePaliWallet,
  usePaliWalletV2,
} from "@contexts/PaliWallet/usePaliWallet";
import { useTransfer } from "@contexts/Transfer/useTransfer";
import { Button } from "@mui/material";
import { ArrowCircleRight } from "@mui/icons-material";
import { useQueryClient } from "react-query";

type Props = {
  networkType: "bitcoin" | "ethereum";
};

const PaliSwitch: React.FC<Props> = ({ networkType }) => {
  const { proceedNextStep } = useTransfer();
  const queryClient = useQueryClient();
  const { account } = useNEVM();
  const { switchTo, connectedAccount, isBitcoinBased } = usePaliWalletV2();

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
    (networkType === "ethereum" && !isBitcoinBased && account) ||
    (networkType === "bitcoin" && isBitcoinBased && connectedAccount)
  ) {
    return (
      <Button variant="contained" color="success" onClick={proceedNextStep}>
        Continue <ArrowCircleRight />
      </Button>
    );
  }

  return (
    <Button variant="contained" onClick={switchNetwork}>
      Switch to {networkName}
    </Button>
  );
};

export default PaliSwitch;
