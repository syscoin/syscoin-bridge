import { Alert, CircularProgress, Link } from "@mui/material";
import { useTransfer } from "../context/TransferContext";
import { useUtxoTransaction } from "components/Bridge/hooks/useUtxoTransaction";
import { ITransferLog, TransferStatus } from "@contexts/Transfer/types";
import React, { useEffect } from "react";
import UTXOStepWrapper from "../UTXOStepWrapper";
import { useConstants } from "@contexts/useConstants";

type Props = {
  invalidStateMessage: string;
  loadingMessage: string;
  successStatus: TransferStatus;
  sourceStatus: TransferStatus;
  confirmations?: number;
};

const BridgeStepConfirmUTXOTransaction: React.FC<Props> = ({
  sourceStatus,
  successStatus,
  invalidStateMessage,
  loadingMessage,
  confirmations,
}) => {
  const { transfer, saveTransfer } = useTransfer();
  const { constants } = useConstants();

  const utxoStepLog = transfer.logs.find(
    (log) => log.status === sourceStatus && Boolean(log.payload?.data?.tx)
  );

  const txId: string | undefined = utxoStepLog?.payload?.data?.tx;

  const { data, isFetched } = useUtxoTransaction(txId, confirmations);

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
          message: "Confirm UTXO Transaction",
        },
        status: sourceStatus,
      },
    ];

    saveTransfer({
      ...transfer,
      logs: updatedLogs,
      status: successStatus,
    });
  }, [data, isFetched, saveTransfer, transfer, successStatus, sourceStatus]);

  if (!txId) {
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
      {loadingMessage} &nbsp;
      <CircularProgress size={"1rem"} />
      <br />
      <Link href={`${constants?.explorer.utxo}/tx/${txId}`} target="_blank">
        View on Explorer
      </Link>
    </Alert>
  );
};

const Wrapped: React.FC<Props> = (props) => (
  <UTXOStepWrapper>
    <BridgeStepConfirmUTXOTransaction {...props} />
  </UTXOStepWrapper>
);

export default Wrapped;
