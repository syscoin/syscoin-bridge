import { ITransfer } from "@contexts/Transfer/types";
import {
  Alert,
  Box,
  InputAdornment,
  TextField,
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
            )} ${showSysx ? "SYSX" : "SYS"}`,
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
              SYSX is the UTXO-side bridge representation of SYS. The bridge
              converts between SYS and SYSX at a 1:1 ratio as part of transfers
              between Syscoin UTXO and Syscoin NEVM.
            </Typography>
          </Typography>
        </Alert>
      )}
    </Box>
  );
};
