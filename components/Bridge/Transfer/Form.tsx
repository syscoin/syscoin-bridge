import {
  Button,
  Card,
  CardContent,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";
import { RocketLaunch } from "@mui/icons-material";

import { FieldValues, useForm } from "react-hook-form";
import { useTransfer } from "../../../contexts/Transfer/useTransfer";
import React, { useEffect } from "react";
import { IPaliWalletV2Context } from "@contexts/PaliWallet/V2Provider";
import { usePaliWallet } from "@contexts/PaliWallet/usePaliWallet";
import { useConnectedWallet } from "@contexts/ConnectedWallet/useConnectedWallet";

const InitializeChecks: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const {
    transfer: { type },
  } = useTransfer();
  const paliwallet = usePaliWallet() as IPaliWalletV2Context;

  if (paliwallet.version === "v2") {
    if (type === "sys-to-nevm" && !paliwallet.isBitcoinBased) {
      return (
        <Button
          variant="contained"
          onClick={() => paliwallet.switchTo("bitcoin")}
        >
          Switch to Syscoin
        </Button>
      );
    } else if (type === "nevm-to-sys" && paliwallet.isBitcoinBased) {
      return (
        <Button
          variant="contained"
          onClick={() => paliwallet.switchTo("ethereum")}
        >
          Switch to NEVM
        </Button>
      );
    }
  }

  return <>{children}</>;
};

const BridgeTransferForm: React.FC = () => {
  const { startTransfer, transfer } = useTransfer();
  const { utxo, nevm } = useConnectedWallet();
  let maxAmount: number | string | undefined = undefined;

  if (transfer.type === "sys-to-nevm") {
    maxAmount = utxo.balance;
  } else if (transfer.type === "nevm-to-sys") {
    maxAmount = nevm.balance;
  }

  const accountsAreSet =
    transfer.utxoAddress && transfer.utxoXpub && transfer.nevmAddress;

  const maxAmountFixed = parseFloat(`${maxAmount ?? "0"}`).toFixed(4);

  const {
    register,
    formState: { errors, isValid, isDirty },
    handleSubmit,
  } = useForm({ mode: "all" });

  const onSubmit = (data: FieldValues) => {
    startTransfer(data.amount);
  };

  return (
    <Card component="form" onSubmit={handleSubmit(onSubmit)}>
      <CardContent sx={{ display: "flex", flexDirection: "column" }}>
        <Typography variant="body2" color="secondary">
          Balance: {maxAmount === undefined ? "--" : maxAmountFixed}
        </Typography>
        <TextField
          label="Amount"
          placeholder="0.1"
          margin="dense"
          inputProps={{ inputMode: "numeric", pattern: "[0-9]+(.?[0-9]+)?" }}
          InputProps={{
            endAdornment: <InputAdornment position="end">SYS</InputAdornment>,
          }}
          {...register("amount", {
            valueAsNumber: true,
            max: {
              value: maxAmountFixed,
              message: `You can transfer up to ${maxAmountFixed} SYS`,
            },
            min: {
              value: 0.001,
              message: "Amount must be atleast 0.1",
            },
            required: {
              message: "Amount is required",
              value: true,
            },
            validate: (value) =>
              isNaN(value) ? "Must be a number" : undefined,
          })}
          disabled={maxAmount === undefined}
          error={!!errors.amount}
          helperText={<>{errors.amount && errors.amount.message}</>}
        />
        <InitializeChecks>
          <Button
            variant="contained"
            type="submit"
            disabled={!isDirty || !isValid || !accountsAreSet}
          >
            Start Transfer <RocketLaunch />
          </Button>
        </InitializeChecks>
      </CardContent>
    </Card>
  );
};

export default BridgeTransferForm;
