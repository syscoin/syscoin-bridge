import { ITransferLog, TransferStatus } from "@contexts/Transfer/types";
import { useTransfer } from "../context/TransferContext";
import { useWeb3 } from "../context/Web";
import { Alert, CircularProgress, Typography } from "@mui/material";
import { useNevmTransaction } from "../hooks/useNevmTransaction";
import { useEffect } from "react";

type Props = {
  successStatus: TransferStatus;
  sourceStatus: TransferStatus;
  invalidStateMessage: string;
  loadingMessage: string;
};

const BridgeV3ConfirmNEVMTransaction: React.FC<Props> = ({
  sourceStatus,
  successStatus,
  invalidStateMessage,
  loadingMessage,
}) => {
  const { transfer, saveTransfer } = useTransfer();

  const sourceLog = transfer?.logs?.find((log) => log.status === sourceStatus);

  const sourceTxHash = sourceLog?.payload.data.hash;

  const { data, isLoading, isFetched } = useNevmTransaction(sourceTxHash);

  useEffect(() => {
    if (!isFetched || !data) {
      return;
    }
    const updatedLogs: ITransferLog[] = [
      ...transfer.logs,
      {
        date: Date.now(),
        payload: {
          data,
          message: "Confirm Transaction",
        },
        status: transfer.status,
      },
    ];
    saveTransfer({ ...transfer, logs: updatedLogs, status: successStatus });
  }, [data, isFetched, saveTransfer, transfer, successStatus]);

  if (!sourceTxHash) {
    return <Alert severity="error">{invalidStateMessage}</Alert>;
  }

  if (isLoading) {
    return (
      <Alert severity="info">
        {loadingMessage}
        <CircularProgress size={"1rem"} />
      </Alert>
    );
  }

  return <Typography variant="body1">Summarizing Transfer</Typography>;
};

export default BridgeV3ConfirmNEVMTransaction;
