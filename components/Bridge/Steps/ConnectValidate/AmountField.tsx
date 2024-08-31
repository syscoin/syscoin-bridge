import { ITransfer } from "@contexts/Transfer/types";
import {
  Box,
  InputAdornment,
  TextField,
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
              {"SYS"}
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
    </Box>
  );
};
