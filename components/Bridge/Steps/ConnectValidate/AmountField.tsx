import { ITransfer } from "@contexts/Transfer/types";
import {
  Alert,
  Box,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";
import { useFormContext } from "react-hook-form";
import {
  formatSyscoinBaseUnits,
  toSyscoinBaseUnits,
} from "utils/syscoin-amount";

type Props = {
  maximumBaseUnits: string;
  minAmount: number;
  balanceLoaded: boolean;
  transfer: ITransfer;
};

export const ConnectValidateAmountField: React.FC<Props> = ({
  maximumBaseUnits,
  minAmount,
  balanceLoaded,
  transfer,
}) => {
  const {
    register,
    formState: { errors },
    watch,
  } = useFormContext();
  const utxoAssetType = watch("utxoAssetType");
  const showSysx = transfer.type === "sys-to-nevm" && utxoAssetType === "sysx";
  const minimumBaseUnits = BigInt(toSyscoinBaseUnits(minAmount.toString()));
  const maximum = BigInt(maximumBaseUnits);

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
          required: {
            message: "Amount is required",
            value: true,
          },
          validate: {
            validAmount: (value: string) => {
              try {
                toSyscoinBaseUnits(value);
                return true;
              } catch (error) {
                return error instanceof Error ? error.message : "Invalid amount";
              }
            },
            minimum: (value: string) => {
              try {
                return (
                  BigInt(toSyscoinBaseUnits(value)) >= minimumBaseUnits ||
                  `Amount must be at least ${minAmount}`
                );
              } catch {
                return true;
              }
            },
            maximum: (value: string) => {
              try {
                return (
                  BigInt(toSyscoinBaseUnits(value)) <= maximum ||
                  `You can transfer up to ${formatSyscoinBaseUnits(
                    maximumBaseUnits
                  )} ${
                    showSysx ? "SYSX" : "SYS"
                  }`
                );
              } catch {
                return true;
              }
            },
          },
        })}
        disabled={!balanceLoaded}
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
