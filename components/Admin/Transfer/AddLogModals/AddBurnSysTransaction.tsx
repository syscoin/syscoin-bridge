import {
  Box,
  Button,
  FormControlLabel,
  TextField,
  Typography,
  Checkbox,
} from "@mui/material";
import AddLogModalContainer from "./ModalContainer";
import { useForm } from "react-hook-form";
import { useUtxoTransaction } from "components/Bridge/v3/hooks/useUtxoTransaction";
import { useNEVM } from "@contexts/ConnectedWallet/NEVMProvider";

type Props = {
  onClose: () => void;
};

type FormValues = {
  txId: string;
  clearAll: boolean;
};

const AddBurnSysTransaction: React.FC<Props> = ({ onClose }) => {
  const { handleSubmit, register, watch } = useForm<FormValues>({
    defaultValues: {
      txId: "",
      clearAll: true,
    },
  });

  const { signMessage } = useNEVM();

  const txId = watch("txId");

  const { isFetching, isFetched, isSuccess } = useUtxoTransaction(
    txId,
    1,
    10_000
  );

  const onSubmit = (values: FormValues) => {
    const data = {
      operation: "burn-sys",
      ...values,
    };
    const message = `0x${Buffer.from(JSON.stringify(data), "utf8").toString(
      "hex"
    )}`;
    signMessage(message).then((signedMessage) => {
      const payload = { ...data, signedMessage };
      console.log(payload);
      onClose();
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
        />
        <FormControlLabel
          control={<Checkbox defaultChecked {...register("clearAll")} />}
          label="Clear all other burn-sys logs"
        />
      </Box>
      <Box display="flex">
        <Button color="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="contained"
          sx={{ ml: "auto" }}
          type="submit"
          disabled={!(isSuccess && isFetched)}
        >
          {isFetching ? "Checking" : "Add"}
        </Button>
      </Box>
    </AddLogModalContainer>
  );
};

export default AddBurnSysTransaction;
