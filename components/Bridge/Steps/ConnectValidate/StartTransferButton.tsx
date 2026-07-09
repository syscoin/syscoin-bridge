import { MIN_AMOUNT, MIN_GAS_AMOUNT } from "@constants";
import { SYSX_ASSET_GUID } from "@contexts/Transfer/constants";
import { ITransfer } from "@contexts/Transfer/types";
import { CheckCircleOutline } from "@mui/icons-material";
import { Box, Button, Typography } from "@mui/material";
import {
  isValidEthereumAddress,
  isValidSYSAddress,
} from "@sidhujag/sysweb3-utils";
import { useFormContext } from "react-hook-form";
import { useNevmBalance, useUtxoBalance } from "utils/balance-hooks";
import { useFeatureFlags } from "../../hooks/useFeatureFlags";
import { useConstants } from "@contexts/useConstants";
import { useNEVM } from "@contexts/ConnectedWallet/NEVMProvider";

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
  const { constants } = useConstants();
  const { isExpectedChain } = useNEVM();
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
  const utxoClaimGasSponsorshipAvailable =
    isEnabled("foundationFundingAvailable") && transfer.type === "nevm-to-sys";

  const isNevmNotEnoughGas =
    !foundationFundingAvailable &&
    Boolean(nevmAddress) &&
    nevmBalance.isFetched &&
    nevmBalance.data !== undefined &&
    nevmBalance.data < MIN_GAS_AMOUNT;

  const isUtxoNotEnoughGas =
    !utxoClaimGasSponsorshipAvailable &&
    Boolean(utxoXpub) &&
    utxoBalance.isFetched &&
    utxoBalance.data !== undefined &&
    utxoBalance.data < MIN_GAS_AMOUNT;

  const isSysxNotEnoughBalance =
    useSysx &&
    transfer.type === "sys-to-nevm" &&
    sysxBalance.data !== undefined &&
    (sysxBalance.data < MIN_AMOUNT || sysxBalance.data < amount);
  const isNevmWrongNetwork = Boolean(nevmAddress) && !isExpectedChain;

  const isUtxoValid =
    isValidSYSAddress(utxoAddress, constants?.isTestnet ? 5700 : 57) &&
    !isUtxoNotEnoughGas &&
    !isSysxNotEnoughBalance &&
    utxoAssetType !== undefined;

  const isNevmValid =
    isValidEthereumAddress(nevmAddress) &&
    !isNevmWrongNetwork &&
    (!isNevmNotEnoughGas || foundationFundingAvailable);
  const isAmountValid = errors.amount === undefined;
  const balanceFetched = utxoBalance.isFetched && nevmBalance.isFetched;
  const isReady =
    isUtxoValid && isNevmValid && isAmountValid && balanceFetched && isValid;
  const willSponsorUtxoClaimGas =
    utxoClaimGasSponsorshipAvailable &&
    Boolean(utxoXpub) &&
    utxoBalance.isFetched &&
    utxoBalance.data !== undefined &&
    utxoBalance.data < MIN_GAS_AMOUNT;
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
      {willSponsorUtxoClaimGas && (
        <Box sx={{ display: "flex", mb: 2 }}>
          <Typography variant="body1">
            UTXO: Bridge will fund the minimal claim gas needed to complete the
            transfer.
          </Typography>
        </Box>
      )}
      {isSysxNotEnoughBalance && (
        <ErrorMessage message="UTXO: Not enough SYSX" />
      )}
      {isNevmNotEnoughGas && (
        <ErrorMessage message="NEVM: Not enough funds for gas" />
      )}
      {isNevmWrongNetwork && (
        <ErrorMessage message="NEVM: Wallet must be connected to the NEVM network" />
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
