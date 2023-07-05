import { useNEVM } from "@contexts/ConnectedWallet/NEVMProvider";
import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import { CheckCircleOutline } from "@mui/icons-material";
import {
  Box,
  Button,
  Card,
  CardContent,
  FormControl,
  FormHelperText,
  FormLabel,
  InputAdornment,
  InputLabel,
  OutlinedInput,
  TextField,
  Typography,
} from "@mui/material";
import { useForm } from "react-hook-form";
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

const BridgeV3ConnectValidateStep: React.FC = () => {
  const { transfer } = useTransfer();
  const { isLoading } = usePaliWalletV2();
  const { nevm, utxo } = useConnectedWallet();
  const {
    register,
    setValue,
    formState: { errors },
    handleSubmit,
    watch,
  } = useForm({
    mode: "all",
    values: {
      amount: 0.1,
      nevmAddress: "",
      utxoAddress: "",
      utxoXpub: "",
    },
  });

  const minAmount = 0.01;
  //Todo: useQuery utxo balance
  //Tod:  useQuery nevm balance
  const balance = transfer.type === "sys-to-nevm" ? utxo.balance : nevm.balance;

  let maxAmountCalculated = parseFloat(`${balance ?? "0"}`) - minAmount;

  if (maxAmountCalculated < 0) {
    maxAmountCalculated = 0;
  }

  if (isLoading) {
    return <BridgeV3Loading />;
  }

  const utxoAddress = watch("utxoAddress");
  const utxoXpub = watch("utxoXpub");
  const nevmAddress = watch("nevmAddress");

  const modifiedTransfer = { ...transfer, utxoAddress, utxoXpub, nevmAddress };

  const isUtxoValid = isValidSYSAddress(utxoAddress, 57);
  const isNevmValid = isValidEthereumAddress(nevmAddress);
  const isAmountValid = errors.amount === undefined;
  const isReady = isUtxoValid && isNevmValid && isAmountValid;

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
      <CardContent>
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

        <Button variant="contained" color="primary" disabled={!isReady}>
          Start Transfer
        </Button>
      </CardContent>
    </Card>
  );
};

export default BridgeV3ConnectValidateStep;
