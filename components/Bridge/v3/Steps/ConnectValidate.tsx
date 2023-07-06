import { useNEVM } from "@contexts/ConnectedWallet/NEVMProvider";
import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import { CheckCircleOutline, CloseOutlined } from "@mui/icons-material";
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  FormHelperText,
  FormLabel,
  InputAdornment,
  InputLabel,
  OutlinedInput,
  TextField,
  Typography,
} from "@mui/material";
import { SubmitHandler, useForm } from "react-hook-form";
import WalletList from "components/WalletList";
import { useTransfer } from "../context/TransferContext";
import { useConnectedWallet } from "@contexts/ConnectedWallet/useConnectedWallet";
import BridgeV3Loading from "../Loading";
import {
  isValidEthereumAddress,
  isValidSYSAddress,
} from "@pollum-io/sysweb3-utils";
import UTXOConnect from "components/Bridge/WalletSwitchV2/UTXOConnect";
import NEVMConnect from "components/Bridge/WalletSwitchV2/NEVMConnect";
import { useNevmBalance, useUtxoBalance } from "utils/balance-hooks";
import { ITransfer } from "@contexts/Transfer/types";
import { useRouter } from "next/router";

const ErrorMessage = ({ message }: { message: string }) => (
  <Box sx={{ display: "flex", mb: 2 }}>
    <Typography variant="body1" color="error">
      {message}
    </Typography>
    <CloseOutlined color="error" />
  </Box>
);

type ConnectValidateFormData = {
  amount: number;
  nevmAddress: string;
  utxoAddress: string;
  utxoXpub: string;
};

const BridgeV3ConnectValidateStep: React.FC = () => {
  const { replace } = useRouter();
  const { transfer, isSaving, saveTransfer } = useTransfer();
  const { isLoading } = usePaliWalletV2();
  const {
    register,
    setValue,
    formState: { errors },
    handleSubmit,
    watch,
  } = useForm<ConnectValidateFormData>({
    mode: "all",
    values: {
      amount: 0.1,
      nevmAddress: "",
      utxoAddress: "",
      utxoXpub: "",
    },
  });

  const utxoAddress = watch("utxoAddress");
  const utxoXpub = watch("utxoXpub");
  const nevmAddress = watch("nevmAddress");
  const minAmount = 0.01;

  const utxoBalance = useUtxoBalance(utxoXpub);
  const nevmBalance = useNevmBalance(nevmAddress);

  const isUtxoNotEnoughGas =
    Boolean(utxoXpub) &&
    utxoBalance.isFetched &&
    utxoBalance.data !== undefined &&
    utxoBalance.data < minAmount;

  const isNevmNotEnoughGas =
    Boolean(nevmAddress) &&
    nevmBalance.isFetched &&
    nevmBalance.data !== undefined &&
    nevmBalance.data < minAmount;

  const balance =
    transfer.type === "sys-to-nevm" ? utxoBalance.data : nevmBalance.data;

  let maxAmountCalculated = parseFloat(`${balance ?? "0"}`) - minAmount;

  if (maxAmountCalculated < 0) {
    maxAmountCalculated = 0;
  }

  const modifiedTransfer = { ...transfer, utxoAddress, utxoXpub, nevmAddress };

  const isUtxoValid = isValidSYSAddress(utxoAddress, 57) && !isUtxoNotEnoughGas;
  const isNevmValid =
    isValidEthereumAddress(nevmAddress) && !isNevmNotEnoughGas;
  const isAmountValid = errors.amount === undefined;
  const balanceFetched = utxoBalance.isFetched && nevmBalance.isFetched;
  const isReady = isUtxoValid && isNevmValid && isAmountValid && balanceFetched;

  const onSubmit: SubmitHandler<ConnectValidateFormData> = (data) => {
    const { amount, ...rest } = data;
    const modifiedTransfer: ITransfer = {
      ...transfer,
      amount: amount.toString(),
      ...rest,
    };
    saveTransfer(modifiedTransfer, {
      onSuccess: (transfer) => {
        replace(`/bridge/v3/${transfer.id}`);
      },
    });
  };

  if (isLoading) {
    return <BridgeV3Loading />;
  }

  return (
    <Card
      sx={{
        mt: 5,
        display: "flex",
        flexDirection: "column",
        minWidth: "20rem",
        width: "50%",
      }}
    >
      <CardContent component="form" onSubmit={handleSubmit(onSubmit)}>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body1" sx={{ mb: 1 }}>
            UTXO:
          </Typography>
          <UTXOConnect
            transfer={modifiedTransfer}
            setUtxo={({ address, xpub }) => {
              setValue("utxoAddress", address);
              setValue("utxoXpub", xpub);
            }}
          />
        </Box>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body1" sx={{ mb: 1 }}>
            NEVM:
          </Typography>
          <NEVMConnect
            transfer={modifiedTransfer}
            setNevm={({ address }) => {
              setValue("nevmAddress", address);
            }}
          />
        </Box>
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
            validate: (value) =>
              isNaN(value) ? "Must be a number" : undefined,
          })}
          disabled={balance === undefined}
          error={!!errors.amount}
          helperText={<>{errors.amount && errors.amount.message}</>}
          sx={{ mb: 2 }}
        />
        {isReady && (
          <Box sx={{ display: "flex", mb: 2 }}>
            <Typography variant="body1">
              All clear! You are ready to start the transfer process.
            </Typography>
            <CheckCircleOutline color="success" />
          </Box>
        )}
        {isUtxoNotEnoughGas && (
          <ErrorMessage message="UTXO: Not enough funds for gas" />
        )}
        {isNevmNotEnoughGas && (
          <ErrorMessage message="NEVM: Not enough funds for gas" />
        )}
        <Button
          sx={{ display: "block" }}
          variant="contained"
          color="primary"
          disabled={!isReady || isSaving}
          type="submit"
        >
          Start Transfer
        </Button>
        {isSaving && (
          <Typography variant="body2" sx={{ mt: 2 }}>
            <CircularProgress sx={{ mr: 1 }} size={"1rem"} />
            Saving ...
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

export default BridgeV3ConnectValidateStep;
