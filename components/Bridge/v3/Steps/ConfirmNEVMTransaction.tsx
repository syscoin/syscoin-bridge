import { ITransferLog, TransferStatus } from "@contexts/Transfer/types";
import { useTransfer } from "../context/TransferContext";
import { useWeb3 } from "../context/Web";
import { Alert, CircularProgress, Link, Typography } from "@mui/material";
import { useNevmTransaction } from "../hooks/useNevmTransaction";
import { useEffect } from "react";
import { NEVM_TX_BLOCKCHAIN_URL } from "@constants";

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

  const sourceLog: ITransferLog | undefined = transfer?.logs?.find(
    (log) => log.status === sourceStatus && Boolean(log?.payload?.data.hash)
  );

  const sourceTxHash = sourceLog?.payload.data.hash;

  const { data, isFetched } = useNevmTransaction(sourceTxHash);

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
          message: "Confirm NEVM Transaction",
        },
        status: transfer.status,
      },
    ];
    saveTransfer({ ...transfer, logs: updatedLogs, status: successStatus });
  }, [data, isFetched, saveTransfer, transfer, successStatus]);

  if (!sourceTxHash) {
    return <Alert severity="error">{invalidStateMessage}</Alert>;
  }

  return (
    <Alert
      severity="info"
      sx={{
        "& .MuiAlert-message": {
          width: "100%",
        },
      }}
    >
      {loadingMessage}
      <CircularProgress size={"1rem"} />
      <br />
      <Link href={`${NEVM_TX_BLOCKCHAIN_URL}${sourceTxHash}`} target="_blank">
        View on Explorer
      </Link>
    </Alert>
  );
};

export default BridgeV3ConfirmNEVMTransaction;
