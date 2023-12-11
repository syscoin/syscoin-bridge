import {
  Box,
  Button,
  FormControlLabel,
  TextField,
  Typography,
  Checkbox,
  Alert,
} from "@mui/material";
import AddLogModalContainer from "./ModalContainer";
import { useForm } from "react-hook-form";
import { useUtxoTransaction } from "components/Bridge/v3/hooks/useUtxoTransaction";
import { useNEVM } from "@contexts/ConnectedWallet/NEVMProvider";
import { AddBurnSysLogRequestPayload } from "api/types/admin/transfer/add-log";
import { useState } from "react";

type Props = {
  onClose: (refetch?: boolean) => void;
  transferId: string;
};

type FormValues = {
  txId: string;
  clearAll: boolean;
};

const AddBurnSysTransaction: React.FC<Props> = ({ onClose, transferId }) => {
  const { handleSubmit, register, watch } = useForm<FormValues>({
    defaultValues: {
      txId: "",
      clearAll: true,
    },
  });

  const [submitError, setSubmitError] = useState<string>();

  const { signMessage } = useNEVM();

  const txId = watch("txId");

  const { isFetching, isFetched, isSuccess, data, isError } =
    useUtxoTransaction(txId, 1, 10_000, 1);

  const isBurnSysTx =
    isFetched && data && data.tokenType === "SPTSyscoinBurnToAssetAllocation";

  let helperText =
    isFetched && !isBurnSysTx ? "Not a valid burn sys transaction" : "";

  if (isError) {
    helperText = "Error fetching transaction";
  }

  const onSubmit = (values: FormValues) => {
    const data = {
      operation: "burn-sys",
      ...values,
    };
    const message = `0x${Buffer.from(JSON.stringify(data), "utf8").toString(
      "hex"
    )}`;
    signMessage(message)
      .then((signedMessage) => {
        const payload: AddBurnSysLogRequestPayload = {
          operation: "burn-sys",
          clearAll: values.clearAll,
          txId: values.txId,
          signedMessage,
        };
        setSubmitError(undefined);
        return fetch(`/api/admin/transfer/${transferId}/add-log`, {
          body: JSON.stringify(payload),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        });
      })
      .then((res) => {
        if (res.ok) {
          onClose(true);
          return;
        }
        return res.json().then(({ message }) => setSubmitError(message));
      });
  };

  return (
    <AddLogModalContainer component="form" onSubmit={handleSubmit(onSubmit)}>
      <Typography>Add Burn Sys Transaction Log</Typography>
      <Box sx={{ my: 2 }} width="100%">
        <TextField
          label="Transaction ID"
          fullWidth
          sx={{ mb: 2 }}
          {...register("txId")}
          error={Boolean(helperText)}
          helperText={helperText}
        />
        <FormControlLabel
          control={<Checkbox defaultChecked {...register("clearAll")} />}
          label="Clear all other burn-sys logs"
        />
      </Box>
      {submitError && <Alert severity="error">{submitError}</Alert>}
      <Box display="flex">
        <Button color="secondary" onClick={() => onClose()}>
          Cancel
        </Button>
        <Button
          variant="contained"
          sx={{ ml: "auto" }}
          type="submit"
          disabled={!(isSuccess && isBurnSysTx) || isFetching}
        >
          {isFetching ? "Checking" : "Add"}
        </Button>
      </Box>
    </AddLogModalContainer>
  );
};

export default AddBurnSysTransaction;
