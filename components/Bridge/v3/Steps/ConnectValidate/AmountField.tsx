import { ITransfer } from "@contexts/Transfer/types";
import { QuestionMarkOutlined } from "@mui/icons-material";
import {
  Alert,
  Box,
  InputAdornment,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useFormContext } from "react-hook-form";

type Props = {
  maxAmountCalculated: number;
  minAmount: number;
  balance?: number;
  transfer: ITransfer;
};

export const ConnectValidateAmountField: React.FC<Props> = ({
  maxAmountCalculated,
  minAmount,
  balance,
  transfer,
}) => {
  const {
    register,
    formState: { errors },
    watch,
  } = useFormContext();
  const utxoAssetType = watch("utxoAssetType");
  const showSysx = transfer.type === "sys-to-nevm" && utxoAssetType === "sysx";
  return (
    <Box>
      <TextField
        label="Amount"
        placeholder="0.1"
        margin="dense"
        inputProps={{ inputMode: "numeric", pattern: "[0-9]+(.?[0-9]+)?" }}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              {showSysx ? "SYSX" : "SYS"}
            </InputAdornment>
          ),
        }}
        {...register("amount", {
          valueAsNumber: true,
          max: {
            value: maxAmountCalculated,
            message: `You can transfer up to ${maxAmountCalculated.toFixed(
              4
            )} SYS`,
          },
          min: {
            value: minAmount,
            message: `Amount must be at least ${minAmount}`,
          },
          required: {
            message: "Amount is required",
            value: true,
          },
          validate: (value) => (isNaN(value) ? "Must be a number" : undefined),
        })}
        disabled={balance === undefined}
        error={!!errors.amount}
        helperText={<>{errors.amount && errors.amount.message}</>}
        sx={{ mb: 2 }}
      />
      {showSysx && (
        <Alert severity="info">
          <Typography variant="body2">
            <Typography variant="subtitle2" sx={{ fontWeight: "bold" }}>
              What is SYSX?
            </Typography>
            <Typography variant="body2">
              SYSX serves as a bridge token between the Syscoin UTXO and Syscoin
              NEVM chains, with a 1:1 ratio to SYS. Users can convert SYS into
              SYSX on the Syscoin UTXO, and then bridge into Syscoin NEVM, or
              vice versa. This conversion process is bidirectional.
            </Typography>
          </Typography>
        </Alert>
      )}
    </Box>
  );
};
