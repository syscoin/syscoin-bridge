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
import { useUtxoTransaction } from "components/Bridge/hooks/useUtxoTransaction";
import { useNEVM } from "@contexts/ConnectedWallet/NEVMProvider";
import { AddUTXOLogRequestPayload } from "api/types/admin/transfer/add-log";
import { useState } from "react";
import { requestAdminWalletAuthorization } from "components/Admin/request-wallet-authorization";

type Props = {
  onClose: (refetch?: boolean) => void;
  transferId: string;
  tokenType: string;
  operation: AddUTXOLogRequestPayload["operation"];
};

type FormValues = {
  txId: string;
  clearAll: boolean;
};

const AddUTXOTransactionModal: React.FC<Props> = ({
  onClose,
  transferId,
  tokenType,
  operation,
}) => {
  const { handleSubmit, register, watch, formState: { isSubmitting } } = useForm<FormValues>({
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

  const isValidTx = isFetched && data && data.tokenType === tokenType;

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
          label="Transaction ID"
          fullWidth
          sx={{ mb: 2 }}
          {...register("txId")}
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

export default AddUTXOTransactionModal;
