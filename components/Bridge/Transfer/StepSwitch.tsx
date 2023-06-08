import { Alert, Button, Typography } from "@mui/material";
import { useTransfer } from "contexts/Transfer/useTransfer";
import BridgeTransferComplete from "./Complete";
import BridgeTransferForm from "./Form";
import WaitNEVMSign from "./StepSwitch/WaitNEVMSign";
import WaitMetamaskTransactionConfirmation from "./StepSwitch/WaitMetamaskTransactionConfirmation";
import WaitForPaliWalletSign from "./StepSwitch/WaitPaliWalletSign";
import WaitPaliWalletTransactionConfirmation from "./StepSwitch/WaitPaliwalletTransactionConfirmation";
import PaliSwitch from "./StepSwitch/PaliSwitchNetwork";
import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";

const BridgeTransferStepSwitch: React.FC = () => {
  const {
    transfer: { status, logs, type },
    revertToPreviousStatus,
  } = useTransfer();
  const pailwallet = usePaliWalletV2();

  if (status === "initialize") {
    return <BridgeTransferForm />;
  }

  if (["burn-sys", "burn-sysx", "mint-sysx"].includes(status)) {
    if (pailwallet.version === "v2" && !pailwallet.isBitcoinBased) {
      return <PaliSwitch networkType="bitcoin" />;
    }
    return <WaitForPaliWalletSign />;
  }

  if (
    [
      "confirm-burn-sys",
      "confirm-burn-sysx",
      "confirm-mint-sysx",
      "generate-proofs",
    ].includes(status)
  ) {
    return <WaitPaliWalletTransactionConfirmation />;
  }
  if (["submit-proofs", "freeze-burn-sys"].includes(status)) {
    if (pailwallet.version === "v2" && pailwallet.isBitcoinBased && pailwallet.isEVMInjected) {
      return <PaliSwitch networkType="ethereum" />;
    }
    return <WaitNEVMSign />;
  }
  if (status === "confirm-freeze-burn-sys") {
    return <WaitMetamaskTransactionConfirmation />;
  }
  if (["completed", "finalizing"].includes(status)) {
    return <BridgeTransferComplete isComplete={status === "completed"} />;
  }

  if (status === "switch") {
    if (type === "sys-to-nevm") {
      return <PaliSwitch networkType="ethereum" />;
    } else if (type === "nevm-to-sys") {
      return <PaliSwitch networkType="bitcoin" />;
    }
  }

  const lastLog = logs[logs.length - 1];
  if (!lastLog) {
    return null;
  }
  const { message } = lastLog.payload;

  return (
    <Alert
      severity="error"
      action={
        <Button
          color="inherit"
          size="small"
          onClick={() => revertToPreviousStatus()}
        >
          Retry
        </Button>
      }
    >
      <Typography variant="body2" color="error">
        {message}
      </Typography>
    </Alert>
  );
};

export default BridgeTransferStepSwitch;
