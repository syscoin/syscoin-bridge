import { Alert, Button, CircularProgress } from "@mui/material";
import { useTransfer } from "../context/TransferContext";
import { useUtxoTransaction } from "components/Bridge/v3/hooks/useUtxoTransaction";
import { ITransferLog, TransferStatus } from "@contexts/Transfer/types";

type BridgeV3StepConfirmBurnSysProps = {
  successStatus: TransferStatus;
};

const BridgeV3StepConfirmBurnSysx: React.FC<BridgeV3StepConfirmBurnSysProps> = ({
  successStatus,
}) => {
  const { transfer, saveTransfer } = useTransfer();

  const burnSysLog = transfer.logs.find(
    (log) => log.status === "burn-sysx" && Boolean(log.payload?.data?.tx)
  );

  const burnSysTxId: string | undefined = burnSysLog?.payload?.data?.tx;

  const { isLoading, data } = useUtxoTransaction(burnSysTxId);

  if (!burnSysTxId) {
    return (
      <Alert severity="error" action={<Button>Retry Burn Sys</Button>}>
        Invalid state: Not Burn Sysx log was saved
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <Alert severity="info">
        Waiting for Burn Sysx transaction to be mined.{" "}
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
          message: "Confirm Burn SYSX",
          previousStatus: "burn-sysx",
        },
        status: "confirm-burn-sysx",
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
      Burn SYSX transaction mined
    </Alert>
  );
};

export default BridgeV3StepConfirmBurnSysx;
