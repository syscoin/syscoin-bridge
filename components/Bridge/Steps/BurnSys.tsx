import { useEffect, useState } from "react";
import { Alert, Box, Button, Typography } from "@mui/material";
import UTXOStepWrapper from "../UTXOStepWrapper";
import { useTransfer } from "../context/TransferContext";
import { useBurnSys } from "../hooks/useBurnSys";
import { NativeConversionBroadcast, readPendingNativeConversion } from "../pending-native-conversion";
import {
  ITransferLog,
  SYS_TO_ETH_TRANSFER_STATUS,
  TransferStatus,
} from "@contexts/Transfer/types";

const isError = (error: unknown): error is Error => {
  return error instanceof Error;
};

type BurnSysProps = {
  successStatus: TransferStatus;
};

const BurnSys: React.FC<BurnSysProps & { transferId: string }> = ({ successStatus, transferId }) => {
  const { transfer, saveTransfer } = useTransfer();
  const [pendingBroadcast, setPendingBroadcast] = useState<NativeConversionBroadcast | null>();
  useEffect(() => {
    setPendingBroadcast(readPendingNativeConversion(transferId));
  }, [transferId]);
  const {
    mutate: signBurnSys,
    isLoading: isSigning,
    isError: isSignError,
    error: signError,
  } = useBurnSys(transfer);

  const saveBroadcast = ({ tx, date }: NativeConversionBroadcast) => {
    const updatedLogs: ITransferLog[] = [
      ...transfer.logs,
      {
        date,
        payload: {
          data: {
            tx,
          },
          message: "Burn SYS to SYSX",
        },
        status: SYS_TO_ETH_TRANSFER_STATUS.BURN_SYS,
      },
    ];
    saveTransfer({
      ...transfer,
      logs: updatedLogs,
      status: successStatus,
    });
  };

  const sign = () => {
    signBurnSys(undefined, {
      onSuccess: (broadcast) => {
        setPendingBroadcast(broadcast);
        saveBroadcast(broadcast);
      },
    });
  };

  if (pendingBroadcast) {
    return (
      <Alert severity="info" action={<Button onClick={() => saveBroadcast(pendingBroadcast)}>Save</Button>}>
        SYS conversion was submitted. Save it to continue.
      </Alert>
    );
  }

  if (isSigning) {
    return <Alert severity="info">Confirm the transaction in Pali Wallet.</Alert>;
  }

  if (isSignError) {
    let errorMessage =
      typeof signError === "string" ? signError : JSON.stringify(signError);

    if (isError(signError)) {
      errorMessage = signError.message;
    }
    return (
      <Alert severity="error" action={<Button onClick={sign}>Retry</Button>}>
        Unable to burn SYS: {errorMessage}
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="body2" sx={{ mb: 1 }}>
        Burn SYS to SYSX
      </Typography>
      <Typography variant="h6" sx={{ mb: 2 }}>
        {transfer.amount} SYS
      </Typography>
      <Button color="primary" variant="contained" onClick={sign} disabled={pendingBroadcast === undefined}>
        Confirm
      </Button>
    </Box>
  );
};

const BridgeStepBurnSys: React.FC<BurnSysProps> = (props) => {
  const { transfer } = useTransfer();
  return (
    <UTXOStepWrapper>
      <BurnSys key={transfer.id} transferId={transfer.id} {...props} />
    </UTXOStepWrapper>
  );
};

export default BridgeStepBurnSys;
