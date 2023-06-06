import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import { useTransfer } from "@contexts/Transfer/useTransfer";
import { Alert, AlertColor, Button } from "@mui/material";

const WaitNEVMSign = () => {
  const { retry, error } = useTransfer();
  const { version } = usePaliWalletV2();
  let alertColor: AlertColor = "info";
  let message = `Check ${
    version === "v2" ? "Pali" : "Metmask"
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
