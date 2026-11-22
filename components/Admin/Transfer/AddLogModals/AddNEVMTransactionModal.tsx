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
import { requestAdminWalletAuthorization } from "components/Admin/request-wallet-authorization";
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
  const { handleSubmit, register, watch, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: {
      txHash: "",
      clearAll: true,
    },
  });

  const [submitError, setSubmitError] = useState<string>();

  const { signMessage } = useNEVM();

  const txHash = watch("txHash");

  const { isFetching, isFetched, isSuccess, isError } =
    useNevmTransaction(txHash, { refetch: false });

  const isValidTx = isFetched;

  let helperText =
    isFetched && !isValidTx ? `Not a valid ${operation} transaction` : "";

  if (isError) {
    helperText = "Error fetching transaction";
  }

  const onSubmit = async (values: FormValues) => {
    setSubmitError(undefined);
    try {
      await requestAdminWalletAuthorization(
        `/api/admin/transfer/${encodeURIComponent(transferId)}/add-log`,
        { operation, ...values },
        signMessage
      );
      onClose(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to add the log.");
    }
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
          disabled={!(isSuccess && isValidTx) || isFetching || isSubmitting}
        >
          {isFetching ? "Checking" : "Add"}
        </Button>
      </Box>
    </AddLogModalContainer>
  );
};

export default AddNEVMTransactionModal;
