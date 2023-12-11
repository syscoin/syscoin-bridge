import NEVMConnect from "components/Bridge/WalletSwitchV2/NEVMConnect";
import UTXOConnect from "components/Bridge/WalletSwitchV2/UTXOConnect";
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
import { SYSX_ASSET_GUID } from "@contexts/Transfer/constants";
import {
  ITransfer,
  SYS_TO_ETH_TRANSFER_STATUS,
  TransferStatus,
} from "@contexts/Transfer/types";
import { CloseOutlined } from "@mui/icons-material";
import { Box, Typography } from "@mui/material";

import { useTransfer } from "../context/TransferContext";
import BridgeV3Loading from "../Loading";
import { ConnectValidateAgreeToTermsCheckbox } from "./ConnectValidate/AgreeToTermsCheckbox";
import { ConnectValidateAmountField } from "./ConnectValidate/AmountField";
import { ConnectValidateStartTransferButton } from "./ConnectValidate/StartTransferButton";

const UTXOWrapped: React.FC<{ transfer: ITransfer }> = ({ transfer }) => {
  const { setValue, watch } = useFormContext();

  const utxoAssetType = watch("utxoAssetType");

  return (
    <UTXOConnect
      transfer={transfer}
      setUtxo={({ address, xpub }) => {
        setValue("utxoAddress", address);
        setValue("utxoXpub", xpub);
      }}
      selectedAsset={utxoAssetType}
      setSelectedAsset={(asset) => setValue("utxoAssetType", asset)}
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
  utxoAssetType?: "sys" | "sysx";
};

type BridgeV3ConnectValidateStepProps = {
  successStatus: TransferStatus;
};

const BridgeV3ConnectValidateStep: React.FC<
  BridgeV3ConnectValidateStepProps
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
      utxoAssetType: undefined,
    },
  });

  const { handleSubmit, watch } = form;

  const utxoAddress = watch("utxoAddress");
  const utxoXpub = watch("utxoXpub");
  const utxoAssetType = watch("utxoAssetType");

  const nevmAddress = watch("nevmAddress");

  const utxoBalance = useUtxoBalance(utxoXpub);
  const sysxBalance = useUtxoBalance(utxoXpub, utxoAddress, SYSX_ASSET_GUID);
  const nevmBalance = useNevmBalance(nevmAddress);

  const useSysx = utxoAssetType === "sysx";

  const maxUtxoAmount = useSysx ? sysxBalance.data : utxoBalance.data;

  const maxAmmount =
    transfer.type === "sys-to-nevm" ? maxUtxoAmount : nevmBalance.data;

  let maxAmountCalculated =
    parseFloat(`${maxAmmount ?? "0"}`) -
    (transfer.type === "sys-to-nevm" && useSysx ? 0 : MIN_AMOUNT);

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
      useSysx,
      status:
        useSysx && transfer.type === "sys-to-nevm"
          ? SYS_TO_ETH_TRANSFER_STATUS.BURN_SYSX
          : successStatus,
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

export default BridgeV3ConnectValidateStep;
