import { Alert, Button, CircularProgress } from "@mui/material";
import { useTransfer } from "../context/TransferContext";
import { useUtxoTransaction } from "utils/transaction-hooks";
import { ITransferLog, TransferStatus } from "@contexts/Transfer/types";

type BridgeV3StepConfirmBurnSysProps = {
  successStatus: TransferStatus;
};

const BridgeV3StepConfirmBurnSys: React.FC<BridgeV3StepConfirmBurnSysProps> = ({
  successStatus,
}) => {
  const { transfer, saveTransfer } = useTransfer();

  const burnSysLog = transfer.logs.find(
    (log) => log.status === "burn-sys" && Boolean(log.payload?.data?.tx)
  );

  const burnSysTxId: string | undefined = burnSysLog?.payload?.data?.tx;

  const { isLoading, data } = useUtxoTransaction(burnSysTxId);

  if (!burnSysTxId) {
    return (
      <Alert severity="error" action={<Button>Retry Burn Sys</Button>}>
        Invalid state: Not Burn Sys log was saved
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <Alert severity="info">
        Waiting for Burn Sys transaction to be mined.{" "}
        <CircularProgress size={"1rem"} />
      </Alert>
    );
  }

  const onSave = () => {
    const updatedLogs: ITransferLog[] = [
      ...transfer.logs,
      {
        date: Date.now(),
        payload: {
          data,
          message: "Confirm Burn SYS",
          previousStatus: "burn-sys",
        },
        status: "confirm-burn-sys",
      },
    ];

    saveTransfer({
      ...transfer,
      logs: updatedLogs,
      status: successStatus,
    });
  };

  return (
    <Alert
      severity="success"
      action={<Button onClick={onSave}>Proceed</Button>}
    >
      Burn SYS transaction mined
    </Alert>
  );
};

export default BridgeV3StepConfirmBurnSys;
