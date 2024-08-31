import NEVMConnect from "components/Bridge/WalletSwitch/NEVMConnect";
import UTXOConnect from "components/Bridge/WalletSwitch/UTXOConnect";
import { useRouter } from "next/router";
import {
  FormProvider,
  SubmitHandler,
  useForm,
  useFormContext,
} from "react-hook-form";
import { useNevmBalance, useUtxoBalance } from "utils/balance-hooks";

import { MIN_AMOUNT } from "@constants";
import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import {
  ITransfer,
  TransferStatus,
} from "@contexts/Transfer/types";
import { Box, Typography } from "@mui/material";

import { useTransfer } from "../context/TransferContext";
import BridgeLoading from "../Loading";
import { ConnectValidateAgreeToTermsCheckbox } from "./ConnectValidate/AgreeToTermsCheckbox";
import { ConnectValidateAmountField } from "./ConnectValidate/AmountField";
import { ConnectValidateStartTransferButton } from "./ConnectValidate/StartTransferButton";

const UTXOWrapped: React.FC<{ transfer: ITransfer }> = ({ transfer }) => {
  const { setValue, watch } = useFormContext();

  return (
    <UTXOConnect
      transfer={transfer}
      setUtxo={({ address, xpub }) => {
        setValue("utxoAddress", address);
        setValue("utxoXpub", xpub);
      }}
    />
  );
};

const NEVMWrapped: React.FC<{ transfer: ITransfer }> = ({ transfer }) => {
  const { setValue } = useFormContext();
  return (
    <NEVMConnect
      transfer={transfer}
      setNevm={({ address }) => {
        setValue("nevmAddress", address);
      }}
    />
  );
};

type ConnectValidateFormData = {
  amount: number;
  nevmAddress: string;
  utxoAddress: string;
  utxoXpub: string;
  agreedToTerms: boolean;
};

type BridgeConnectValidateStepProps = {
  successStatus: TransferStatus;
};

const BridgeConnectValidateStep: React.FC<
  BridgeConnectValidateStepProps
> = ({ successStatus }) => {
  const { replace } = useRouter();
  const { transfer, isSaving, saveTransfer } = useTransfer();
  const { isLoading } = usePaliWalletV2();
  const form = useForm<ConnectValidateFormData>({
    mode: "all",
    values: {
      amount: 0.1,
      nevmAddress: "",
      utxoAddress: "",
      utxoXpub: "",
      agreedToTerms: false,
    },
  });

  const { handleSubmit, watch } = form;

  const utxoAddress = watch("utxoAddress");
  const utxoXpub = watch("utxoXpub");

  const nevmAddress = watch("nevmAddress");

  const utxoBalance = useUtxoBalance(utxoXpub);
  const nevmBalance = useNevmBalance(nevmAddress);

  const maxUtxoAmount =utxoBalance.data;

  const maxAmmount =
    transfer.type === "sys-to-nevm" ? maxUtxoAmount : nevmBalance.data;

  let maxAmountCalculated =
    parseFloat(`${maxAmmount ?? "0"}`) - MIN_AMOUNT;

  if (maxAmountCalculated < 0) {
    maxAmountCalculated = 0;
  }

  const modifiedTransfer = { ...transfer, utxoAddress, utxoXpub, nevmAddress };

  const onSubmit: SubmitHandler<ConnectValidateFormData> = (data) => {
    const { amount, ...rest } = data;
    const modifiedTransfer: ITransfer = {
      ...transfer,
      amount: amount.toString(),
      ...rest,
      status: successStatus,
    };
    saveTransfer(modifiedTransfer, {
      onSuccess: (transfer) => {
        replace(`/bridge/${transfer.id}`);
      },
    });
  };

  if (isLoading) {
    return <BridgeLoading />;
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body1" sx={{ mb: 1 }}>
            <strong>From</strong> Syscoin{" "}
            {transfer.type === "sys-to-nevm" ? "UTXO" : "NEVM"}:
          </Typography>
          {transfer.type === "sys-to-nevm" ? (
            <UTXOWrapped transfer={modifiedTransfer} />
          ) : (
            <NEVMWrapped transfer={modifiedTransfer} />
          )}
        </Box>
        <Box sx={{ mt: 2, mb: 2 }}>
          <Typography variant="body1" sx={{ mb: 1 }}>
            <strong>To</strong> Syscoin{" "}
            {transfer.type === "nevm-to-sys" ? "UTXO" : "NEVM"}:
          </Typography>
          {transfer.type === "nevm-to-sys" ? (
            <UTXOWrapped transfer={modifiedTransfer} />
          ) : (
            <NEVMWrapped transfer={modifiedTransfer} />
          )}
        </Box>
        <ConnectValidateAmountField
          maxAmountCalculated={maxAmountCalculated}
          minAmount={MIN_AMOUNT}
          balance={maxAmmount}
          transfer={modifiedTransfer}
        />
        <ConnectValidateAgreeToTermsCheckbox />
        <ConnectValidateStartTransferButton
          isSaving={isSaving}
          transfer={modifiedTransfer}
        />
      </form>
    </FormProvider>
  );
};

export default BridgeConnectValidateStep;
