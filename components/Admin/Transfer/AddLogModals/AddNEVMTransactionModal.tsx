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
import { useNEVM } from "@contexts/ConnectedWallet/NEVMProvider";
import {
  AddNEVMLogRequestPayload,
} from "api/types/admin/transfer/add-log";
import { useState } from "react";
import { useNevmTransaction } from "components/Bridge/hooks/useNevmTransaction";

type Props = {
  onClose: (refetch?: boolean) => void;
  transferId: string;
  operation: AddNEVMLogRequestPayload["operation"];
};

type FormValues = {
  txHash: string;
  clearAll: boolean;
};

const AddNEVMTransactionModal: React.FC<Props> = ({
  onClose,
  transferId,
  operation,
}) => {
  const { handleSubmit, register, watch } = useForm<FormValues>({
    defaultValues: {
      txHash: "",
      clearAll: true,
    },
  });

  const [submitError, setSubmitError] = useState<string>();

  const { signMessage } = useNEVM();

  const txHash = watch("txHash");

  const { isFetching, isFetched, isSuccess, data, isError } =
    useNevmTransaction(txHash, { refetch: false });

  const isValidTx = isFetched;

  let helperText =
    isFetched && !isValidTx ? `Not a valid ${operation} transaction` : "";

  if (isError) {
    helperText = "Error fetching transaction";
  }

  const onSubmit = (values: FormValues) => {
    const data = {
      operation,
      ...values,
    };
    const message = `0x${Buffer.from(JSON.stringify(data), "utf8").toString(
      "hex"
    )}`;
    signMessage(message)
      .then((signedMessage) => {
        const payload: AddNEVMLogRequestPayload = {
          operation,
          clearAll: values.clearAll,
          txHash: values.txHash,
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
      <Typography variant="body1" sx={{ textTransform: "capitalize" }}>
        Add {operation.split("_")} Transaction Log
      </Typography>
      <Box sx={{ my: 2 }} width="100%">
        <TextField
          label="Transaction Hash"
          fullWidth
          sx={{ mb: 2 }}
          {...register("txHash")}
          error={Boolean(helperText)}
          helperText={helperText}
        />
        <FormControlLabel
          control={<Checkbox defaultChecked {...register("clearAll")} />}
          label={`Clear all other ${operation} logs`}
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
          disabled={!(isSuccess && isValidTx) || isFetching}
        >
          {isFetching ? "Checking" : "Add"}
        </Button>
      </Box>
    </AddLogModalContainer>
  );
};

export default AddNEVMTransactionModal;
