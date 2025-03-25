import { ITransferLog, TransferStatus } from "@contexts/Transfer/types";
import { useTransfer } from "../context/TransferContext";
import { Alert, CircularProgress, Link } from "@mui/material";
import { useNevmTransaction } from "../hooks/useNevmTransaction";
import { useEffect } from "react";
import NEVMStepWrapper from "../NEVMStepWrapepr";
import { useConstants } from "@contexts/useConstants";

type Props = {
  successStatus: TransferStatus;
  sourceStatus: TransferStatus;
  invalidStateMessage: string;
  loadingMessage: string;
};

const BridgeConfirmNEVMTransaction: React.FC<Props> = ({
  sourceStatus,
  successStatus,
  invalidStateMessage,
  loadingMessage,
}) => {
  const { constants } = useConstants();
  const { transfer, saveTransfer } = useTransfer();

  const sourceLog: ITransferLog | undefined = transfer?.logs?.find(
    (log) => log.status === sourceStatus && Boolean(log?.payload?.data?.hash)
  );

  const sourceTxHash = sourceLog?.payload.data.hash;

  const { data, isFetched } = useNevmTransaction(sourceTxHash, {
    refetch: true,
  });

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
      <Link
        href={`${constants?.explorer.nevm}/tx/${sourceTxHash}`}
        target="_blank"
      >
        View on Explorer
      </Link>
    </Alert>
  );
};

const Wrapped: React.FC<Props> = (props) => (
  <NEVMStepWrapper>
    <BridgeConfirmNEVMTransaction {...props} />
  </NEVMStepWrapper>
);

export default Wrapped;
