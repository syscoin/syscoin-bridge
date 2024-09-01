import { Alert, Box, Button, Typography } from "@mui/material";
import UTXOStepWrapper from "../UTXOStepWrapper";
import { useTransfer } from "../context/TransferContext";
import {
  ETH_TO_SYS_TRANSFER_STATUS,
  ITransferLog,
  TransferStatus,
} from "@contexts/Transfer/types";

import { useMintSys } from "../hooks/useMintSys";
import { TransactionReceipt } from "web3-core";

const isError = (error: unknown): error is Error => {
  return error instanceof Error;
};

type Props = {
  successStatus: TransferStatus;
};

const MintSys: React.FC<Props> = ({ successStatus }) => {
  const { transfer, saveTransfer } = useTransfer();

  const freezeBurnConfirmationLog = transfer.logs.find(
    (log) => log.status === "confirm-freeze-burn-sys"
  );

  const transactionReceipt: TransactionReceipt | undefined =
    freezeBurnConfirmationLog?.payload.data;

  const {
    mutate: mintSys,
    isLoading: isSigning,
    isError: isSignError,
    error: signError,
  } = useMintSys(transfer);

  if (!transactionReceipt) {
    return (
      <Alert severity="error">
        Invalid State: Freeze logs was not saved
      </Alert>
    );
  }

  const onSignatureSuccess = (tx: string) => {
    const updatedLogs: ITransferLog[] = [
      ...transfer.logs,
      {
        date: Date.now(),
        payload: {
          data: {
            tx,
          },
          message: "Mint SYS",
        },
        status: ETH_TO_SYS_TRANSFER_STATUS.MINT_SYS,
      },
    ];
    saveTransfer({
      ...transfer,
      logs: updatedLogs,
      status: successStatus,
    });
  };

  const onSignatureError = (error: unknown) => {
    const updatedLogs: ITransferLog[] = [
      ...transfer.logs,
      {
        date: Date.now(),
        payload: {
          data: {
            error,
          },
          message: "Mint SYS",
        },
        status: ETH_TO_SYS_TRANSFER_STATUS.MINT_SYS,
      },
    ];
    saveTransfer({
      ...transfer,
      logs: updatedLogs,
    });
  };

  const sign = () => {
    if (!transactionReceipt) {
      return;
    }
    mintSys(transactionReceipt.transactionHash, {
      onSuccess: onSignatureSuccess,
      onError: onSignatureError,
    });
  };

  if (isSigning) {
    return <Alert severity="info">Check Pali Wallet for signing</Alert>;
  }

  if (isSignError) {
    let errorMessage =
      typeof signError === "string" ? signError : JSON.stringify(signError);

    if (isError(signError)) {
      errorMessage = signError.message;
    }
    return (
      <Alert severity="error" action={<Button onClick={sign}>Retry</Button>}>
        Mint SYS error: {errorMessage}
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="body2" sx={{ mb: 1 }}>
        Confirm Mint of SYS:
      </Typography>
      <Typography variant="h6" sx={{ mb: 2 }}>
        {transfer.amount} SYS
      </Typography>
      <Button color="primary" variant="contained" onClick={sign}>
        Confirm
      </Button>
    </Box>
  );
};

const BridgeStepMintSys: React.FC<Props> = (props) => (
  <UTXOStepWrapper>
    <MintSys {...props} />
  </UTXOStepWrapper>
);

export default BridgeStepMintSys;
