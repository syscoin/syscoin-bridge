import { useConnectedWallet } from "@contexts/ConnectedWallet/useConnectedWallet";
import { useTransfer } from "@contexts/Transfer/useTransfer";
import { Alert, AlertColor, Button } from "@mui/material";

const WaitNEVMSign = () => {
  const { retry, error } = useTransfer();
  const { nevm } = useConnectedWallet();
  let alertColor: AlertColor = "info";
  let message = `Check ${
    nevm.type === "pali-wallet" ? "Pali" : "Metmask"
  } Wallet for signing`;
  if (error) {
    alertColor = "error";
    if (typeof error === "string") {
      message = error;
    }
  }

  return (
    <Alert
      severity={alertColor}
      action={
        <Button color="inherit" size="small" onClick={() => retry()}>
          Retry
        </Button>
      }
    >
      {message}
    </Alert>
  );
};

export default WaitNEVMSign;
