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
import { isPaliV2UtxoMode } from "@contexts/PaliWallet/network-query-policy";
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
  const { supportsPartialUtxoSigning, version, isEVMInjected, isBitcoinBased } = usePaliWalletV2();
  const {
    watch,
    formState: { errors, isValid },
  } = useFormContext();
  const { isEnabled, canSponsorProof } = useFeatureFlags();
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

  const goesToNevm = transfer.type === "sys-to-nevm";
  const proofSponsored = goesToNevm && canSponsorProof(amount);
  const utxoSponsorshipAvailable =
    isEnabled("foundationFundingAvailable") &&
    supportsPartialUtxoSigning &&
    (transfer.type === "nevm-to-sys" || useSysx);

  const needsNevmGas = !proofSponsored && Boolean(nevmAddress);
  const hasNevmBalance = nevmBalance.data !== undefined;
  const isNevmNotEnoughGas =
    needsNevmGas &&
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
  const canSwitchToNevm = isPaliV2UtxoMode(version, isEVMInjected, isBitcoinBased);
  const isNevmWrongNetwork = Boolean(nevmAddress) && !isExpectedChain && !canSwitchToNevm;

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
    !isNevmNotEnoughGas;
  const isAmountValid = errors.amount === undefined;
  const balanceFetched = utxoBalance.isFetched && nevmBalance.isFetched;
  const isReady =
    isUtxoValid && isNevmValid && isAmountValid && balanceFetched &&
    (!needsNevmGas || hasNevmBalance) && isValid;
  return (
    <>
      {isReady && (
        <Box sx={{ display: "flex", mb: 2 }}>
          <Typography variant="body1">
            Approve the transfer details in your NEVM wallet to get started.
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
        <ErrorMessage
          message={goesToNevm
            ? "Add SYS to your NEVM wallet to pay for proof submission at this amount."
            : "NEVM: Insufficient SYS for gas"}
        />
      )}
      {needsNevmGas && nevmBalance.isFetched && !hasNevmBalance && (
        <ErrorMessage message="Unable to check the NEVM gas balance." />
      )}
      {goesToNevm && amountBaseUnits !== undefined && !proofSponsored &&
        hasNevmBalance && !isNevmNotEnoughGas && (
          <Typography variant="body2" sx={{ mb: 2 }}>
            Your NEVM wallet will pay the proof submission fee.
          </Typography>
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
