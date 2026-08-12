import NEVMConnect from "components/Bridge/WalletSwitch/NEVMConnect";
import UTXOConnect, {
  AssetType,
} from "components/Bridge/WalletSwitch/UTXOConnect";
import { useRouter } from "next/router";
import {
  FormProvider,
  SubmitHandler,
  useForm,
  useFormContext,
} from "react-hook-form";
import {
  useNevmBalanceBaseUnits,
  useUtxoBalanceBaseUnits,
} from "utils/balance-hooks";
import {
  getTransferableSyscoinBaseUnits,
  toSyscoinBaseUnits,
} from "utils/syscoin-amount";

import { MIN_AMOUNT, MIN_GAS_AMOUNT } from "@constants";
import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import { SYSX_ASSET_GUID } from "@contexts/Transfer/constants";
import {
  ITransfer,
  SYS_TO_ETH_TRANSFER_STATUS,
  TransferStatus,
} from "@contexts/Transfer/types";
import { Box, Typography } from "@mui/material";

import { useTransfer } from "../context/TransferContext";
import type { ConnectValidateDraft } from "../connect-validate-draft";
import BridgeLoading from "../Loading";
import { ConnectValidateAgreeToTermsCheckbox } from "./ConnectValidate/AgreeToTermsCheckbox";
import { ConnectValidateAmountField } from "./ConnectValidate/AmountField";
import { ConnectValidateStartTransferButton } from "./ConnectValidate/StartTransferButton";
import { useCallback, useEffect } from "react";

const UTXOWrapped: React.FC<{ transfer: ITransfer }> = ({ transfer }) => {
  const { setValue, watch } = useFormContext();

  const utxoAssetType = watch("utxoAssetType");

  const setSelectedAsset = useCallback(
    (asset: AssetType) => setValue("utxoAssetType", asset),
    [setValue]
  );

  const setUtxo = useCallback(
    ({ address, xpub }: { address: string; xpub: string }) => {
      setValue("utxoAddress", address);
      setValue("utxoXpub", xpub);
    },
    [setValue]
  );

  return (
    <UTXOConnect
      transfer={transfer}
      setUtxo={setUtxo}
      selectedAsset={utxoAssetType}
      setSelectedAsset={setSelectedAsset}
    />
  );
};

const NEVMWrapped: React.FC<{ transfer: ITransfer }> = ({ transfer }) => {
  const { setValue } = useFormContext();
  
  const setNevm = useCallback(({ address }: { address: string }) => {
    setValue("nevmAddress", address);
  }, [setValue]);
  
  return (
    <NEVMConnect
      transfer={transfer}
      setNevm={setNevm}
    />
  );
};

type ConnectValidateFormData = {
  amount: string;
  nevmAddress: string;
  utxoAddress: string;
  utxoXpub: string;
  agreedToTerms: boolean;
  utxoAssetType?: "sys" | "sysx";
};

type BridgeConnectValidateStepProps = {
  successStatus: TransferStatus;
  onDraftChange?: (draft: ConnectValidateDraft) => void;
};

const parseTransferAmount = (amount: string) => {
  try {
    toSyscoinBaseUnits(amount);
    return amount;
  } catch {
    return "0.1";
  }
};

const hasDraftFormValues = (
  amount: string,
  utxoAssetType?: "sys" | "sysx"
) => {
  try {
    toSyscoinBaseUnits(amount);
    return true;
  } catch {
    return Boolean(utxoAssetType);
  }
};

const BridgeConnectValidateStep: React.FC<
  BridgeConnectValidateStepProps
> = ({ successStatus, onDraftChange }) => {
  const { replace } = useRouter();
  const { transfer, isSaving, saveTransfer } = useTransfer();
  const { isLoading } = usePaliWalletV2();
  const form = useForm<ConnectValidateFormData>({
    mode: "all",
    values: {
      amount: parseTransferAmount(transfer.amount),
      nevmAddress: transfer.nevmAddress || "",
      utxoAddress: transfer.utxoAddress || "",
      utxoXpub: transfer.utxoXpub || "",
      agreedToTerms: false,
      utxoAssetType: transfer.utxoAssetType,
    },
  });

  const { handleSubmit, watch, reset } = form;

  const amount = watch("amount");
  const utxoAddress = watch("utxoAddress");
  const utxoXpub = watch("utxoXpub");
  const utxoAssetType = watch("utxoAssetType");

  const nevmAddress = watch("nevmAddress");

  useEffect(() => {
    let draftAmount: string | undefined;
    try {
      toSyscoinBaseUnits(amount);
      draftAmount = amount;
    } catch {
      draftAmount = undefined;
    }

    onDraftChange?.({
      amount: draftAmount,
      nevmAddress,
      utxoAddress,
      utxoXpub,
      utxoAssetType,
    });
  }, [
    amount,
    nevmAddress,
    onDraftChange,
    utxoAddress,
    utxoAssetType,
    utxoXpub,
  ]);

  // Reset form when transfer ID changes (e.g., starting a new transfer)
  useEffect(() => {
    if (
      transfer.status === "initialize" &&
      !transfer.nevmAddress &&
      !transfer.utxoAddress &&
      !hasDraftFormValues(transfer.amount, transfer.utxoAssetType)
    ) {
      reset({
        amount: "0.1",
        nevmAddress: "",
        utxoAddress: "",
        utxoXpub: "",
        agreedToTerms: false,
        utxoAssetType: undefined,
      });
    }
  }, [
    reset,
    transfer.amount,
    transfer.id,
    transfer.nevmAddress,
    transfer.status,
    transfer.utxoAddress,
    transfer.utxoAssetType,
  ]);

  const utxoBalance = useUtxoBalanceBaseUnits(utxoXpub);
  const sysxBalance = useUtxoBalanceBaseUnits(utxoXpub, {
    address: utxoAddress,
    assetGuid: SYSX_ASSET_GUID,
  });
  const nevmBalance = useNevmBalanceBaseUnits(nevmAddress);

  const useSysx = utxoAssetType === "sysx";

  const maxUtxoBalance = useSysx ? sysxBalance.data : utxoBalance.data;
  const maxBalance =
    transfer.type === "sys-to-nevm" ? maxUtxoBalance : nevmBalance.data;
  const maximumBaseUnits = getTransferableSyscoinBaseUnits({
    balanceBaseUnits: maxBalance ?? "0",
    balanceDecimals: transfer.type === "sys-to-nevm" ? 8 : 18,
    reserveBaseUnits:
      transfer.type === "sys-to-nevm" && useSysx
        ? "0"
        : toSyscoinBaseUnits(MIN_GAS_AMOUNT.toString()),
  });

  const modifiedTransfer = { ...transfer, utxoAddress, utxoXpub, nevmAddress };

  const onSubmit: SubmitHandler<ConnectValidateFormData> = (data) => {
    const { amount, ...rest } = data;
    const modifiedTransfer: ITransfer = {
      ...transfer,
      amount,
      ...rest,
      useSysx,
      status:
        useSysx && transfer.type === "sys-to-nevm"
          ? SYS_TO_ETH_TRANSFER_STATUS.BURN_SYSX
          : successStatus,
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
          maximumBaseUnits={maximumBaseUnits}
          minAmount={MIN_AMOUNT}
          balanceLoaded={maxBalance !== undefined}
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
