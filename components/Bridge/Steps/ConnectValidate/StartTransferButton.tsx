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
import {
  useNevmBalanceBaseUnits,
  useUtxoBalanceBaseUnits,
} from "utils/balance-hooks";
import { useFeatureFlags } from "../../hooks/useFeatureFlags";
import { useConstants } from "@contexts/useConstants";
import { useNEVM } from "@contexts/ConnectedWallet/NEVMProvider";
import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import {
  getSyscoinChainId,
  resolveSyscoinIsTestnet,
} from "utils/network-config";
import {
  getTransferableSyscoinBaseUnits,
  toSyscoinBaseUnits,
} from "utils/syscoin-amount";

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
  const { supportsPartialUtxoSigning } = usePaliWalletV2();
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
  const utxoBalance = useUtxoBalanceBaseUnits(utxoXpub);
  const sysxBalance = useUtxoBalanceBaseUnits(utxoXpub, {
    address: utxoAddress,
    assetGuid: SYSX_ASSET_GUID,
  });
  const nevmBalance = useNevmBalanceBaseUnits(nevmAddress);
  const minimumAmountBaseUnits = BigInt(
    toSyscoinBaseUnits(MIN_AMOUNT.toString())
  );
  const minimumGasBaseUnits = BigInt(
    toSyscoinBaseUnits(MIN_GAS_AMOUNT.toString())
  );
  let amountBaseUnits: bigint | undefined;
  try {
    amountBaseUnits = BigInt(toSyscoinBaseUnits(amount));
  } catch {
    amountBaseUnits = undefined;
  }

  const foundationFundingAvailable =
    isEnabled("foundationFundingAvailable") && transfer.type === "sys-to-nevm";
  const utxoSponsorshipAvailable =
    isEnabled("foundationFundingAvailable") &&
    supportsPartialUtxoSigning &&
    (transfer.type === "nevm-to-sys" || useSysx);

  const isNevmNotEnoughGas =
    !foundationFundingAvailable &&
    Boolean(nevmAddress) &&
    nevmBalance.isFetched &&
    nevmBalance.data !== undefined &&
    BigInt(
      getTransferableSyscoinBaseUnits({
        balanceBaseUnits: nevmBalance.data,
        balanceDecimals: 18,
        reserveBaseUnits: "0",
      })
    ) < minimumGasBaseUnits;

  const isUtxoNotEnoughGas =
    !utxoSponsorshipAvailable &&
    Boolean(utxoXpub) &&
    utxoBalance.isFetched &&
    utxoBalance.data !== undefined &&
    BigInt(utxoBalance.data) < minimumGasBaseUnits;

  const isSysxNotEnoughBalance =
    useSysx &&
    transfer.type === "sys-to-nevm" &&
    sysxBalance.data !== undefined &&
    (BigInt(sysxBalance.data) < minimumAmountBaseUnits ||
      (amountBaseUnits !== undefined &&
        BigInt(sysxBalance.data) < amountBaseUnits));
  const isNevmWrongNetwork = Boolean(nevmAddress) && !isExpectedChain;

  const isUtxoValid =
    isValidSYSAddress(
      utxoAddress,
      getSyscoinChainId(resolveSyscoinIsTestnet(constants))
    ) &&
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
  return (
    <>
      {isReady && (
        <Box sx={{ display: "flex", mb: 2 }}>
          <Typography variant="body1">
            Ready to start this transfer.
          </Typography>
          <CheckCircleOutline color="success" />
        </Box>
      )}
      {isUtxoNotEnoughGas && (
        <ErrorMessage message="UTXO: Insufficient SYS for transaction fees" />
      )}
      {isSysxNotEnoughBalance && (
        <ErrorMessage message="UTXO: Insufficient SYSX" />
      )}
      {isNevmNotEnoughGas && (
        <ErrorMessage message="NEVM: Insufficient SYS for gas" />
      )}
      {isNevmWrongNetwork && (
        <ErrorMessage message="NEVM: Switch the wallet to the configured network" />
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
