import { MIN_AMOUNT } from "@constants";
import { SYSX_ASSET_GUID } from "@contexts/Transfer/constants";
import { ITransfer } from "@contexts/Transfer/types";
import { CheckCircleOutline } from "@mui/icons-material";
import { Box, Button, Typography } from "@mui/material";
import {
  isValidEthereumAddress,
  isValidSYSAddress,
} from "@pollum-io/sysweb3-utils";
import { useFormContext } from "react-hook-form";
import { useNevmBalance, useUtxoBalance } from "utils/balance-hooks";
import { useFeatureFlags } from "../../hooks/useFeatureFlags";

const ErrorMessage = ({ message }: { message: string }) => (
  <Box sx={{ display: "flex", mb: 2 }}>
    <Typography variant="body1" color="error">
      {message}
    </Typography>
  </Box>
);

export const ConnectValidateStartTransferButton: React.FC<{
  transfer: ITransfer;
  isSaving: boolean;
}> = ({ isSaving, transfer }) => {
  const {
    watch,
    formState: { errors, isValid },
  } = useFormContext();
  const { isEnabled } = useFeatureFlags();
  const utxoAddress = watch("utxoAddress");
  const nevmAddress = watch("nevmAddress");
  const utxoXpub = watch("utxoXpub");
  const utxoAssetType = watch("utxoAssetType");
  const useSysx = utxoAssetType === "sysx";
  const amount = watch("amount");
  const utxoBalance = useUtxoBalance(utxoXpub);
  const sysxBalance = useUtxoBalance(utxoXpub, {
    address: utxoAddress,
    assetGuid: SYSX_ASSET_GUID,
  });
  const nevmBalance = useNevmBalance(nevmAddress);

  const foundationFundingAvailable =
    isEnabled("foundationFundingAvailable") && transfer.type === "sys-to-nevm";

  const isNevmNotEnoughGas =
    !foundationFundingAvailable &&
    Boolean(nevmAddress) &&
    nevmBalance.isFetched &&
    nevmBalance.data !== undefined &&
    nevmBalance.data < MIN_AMOUNT;

  const isUtxoNotEnoughGas =
    Boolean(utxoXpub) &&
    utxoBalance.isFetched &&
    utxoBalance.data !== undefined &&
    utxoBalance.data < MIN_AMOUNT;

  const isSysxNotEnoughBalance =
    useSysx &&
    transfer.type === "sys-to-nevm" &&
    sysxBalance.data !== undefined &&
    (sysxBalance.data < MIN_AMOUNT || sysxBalance.data < amount);

  const isUtxoValid =
    isValidSYSAddress(utxoAddress, 57) &&
    !isUtxoNotEnoughGas &&
    !isSysxNotEnoughBalance &&
    utxoAssetType !== undefined;

  const isNevmValid =
    isValidEthereumAddress(nevmAddress) &&
    (!isNevmNotEnoughGas || foundationFundingAvailable);
  const isAmountValid = errors.amount === undefined;
  const balanceFetched = utxoBalance.isFetched && nevmBalance.isFetched;
  const isReady =
    isUtxoValid && isNevmValid && isAmountValid && balanceFetched && isValid;
  return (
    <>
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
      {isSysxNotEnoughBalance && (
        <ErrorMessage message="UTXO: Not enough SYSX" />
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
    </>
  );
};
