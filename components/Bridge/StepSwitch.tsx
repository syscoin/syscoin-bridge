import {
  COMMON_STATUS,
  ETH_TO_SYS_TRANSFER_STATUS,
  SYS_TO_ETH_TRANSFER_STATUS,
} from "@contexts/Transfer/types";
import BridgeStepBurnSys from "./Steps/BurnSys";
import BridgeStepBurnSysx from "./Steps/BurnSysx";
import BridgeCompleteNevmToSys from "./Steps/CompleteNevmToSys";
import BridgeCompleteSysToNevm from "./Steps/CompleteSysToNevm";
import BridgeConfirmNEVMTransaction from "./Steps/ConfirmNEVMTransaction";
import BridgeStepConfirmUTXOTransaction from "./Steps/ConfirmUTXOTransaction";
import BridgeConnectValidateStep from "./Steps/ConnectValidate";
import BridgeStepFreezeAndBurnSys from "./Steps/FreezeAndBurnSys";
import BridgeStepGenerateProofs from "./Steps/GenerateProofs";
import BridgeStepMintSysx from "./Steps/MintSysx";
import BridgeStepSubmitProofs from "./Steps/SubmitProofs";
import { useTransfer } from "./context/TransferContext";

const BridgeStepSwitch = () => {
  const { transfer } = useTransfer();
  if (transfer.type === "nevm-to-sys") {
    if (transfer.status === COMMON_STATUS.INITIALIZE) {
      return (
        <BridgeConnectValidateStep
          successStatus={ETH_TO_SYS_TRANSFER_STATUS.FREEZE_BURN_SYS}
        />
      );
    } else if (transfer.status === ETH_TO_SYS_TRANSFER_STATUS.FREEZE_BURN_SYS) {
      return (
        <BridgeStepFreezeAndBurnSys
          successStatus={ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_FREEZE_BURN_SYS}
        />
      );
    } else if (
      transfer.status === ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_FREEZE_BURN_SYS
    ) {
      return (
        <BridgeConfirmNEVMTransaction
          invalidStateMessage="Invalid State: Freeze and Burn logs was not saved"
          loadingMessage="Confirming freeze and burn transaction..."
          sourceStatus={ETH_TO_SYS_TRANSFER_STATUS.FREEZE_BURN_SYS}
          successStatus={ETH_TO_SYS_TRANSFER_STATUS.MINT_SYSX}
        />
      );
    } else if (transfer.status === ETH_TO_SYS_TRANSFER_STATUS.MINT_SYSX) {
      return (
        <BridgeStepMintSysx
          successStatus={ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_MINT_SYSX}
        />
      );
    } else if (
      transfer.status === ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_MINT_SYSX
    ) {
      return (
        <BridgeStepConfirmUTXOTransaction
          invalidStateMessage="Invalid State: Mint Sysx transaction was not saved"
          loadingMessage="Confirming Mint of Sysx transaction..."
          sourceStatus={ETH_TO_SYS_TRANSFER_STATUS.MINT_SYSX}
          successStatus={ETH_TO_SYS_TRANSFER_STATUS.BURN_SYSX}
        />
      );
    } else if (transfer.status === ETH_TO_SYS_TRANSFER_STATUS.BURN_SYSX) {
      return (
        <BridgeStepBurnSysx
          successStatus={ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_BURN_SYSX}
          toNevm={false}
        />
      );
    } else if (
      transfer.status === ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_BURN_SYSX
    ) {
      return (
        <BridgeStepConfirmUTXOTransaction
          invalidStateMessage="Invalid State: Burn Sysx transaction was not saved"
          loadingMessage="Confirming Burn of Sysx transaction..."
          sourceStatus={ETH_TO_SYS_TRANSFER_STATUS.BURN_SYSX}
          successStatus={COMMON_STATUS.COMPLETED}
        />
      );
    } else if (transfer.status === COMMON_STATUS.COMPLETED) {
      return <BridgeCompleteNevmToSys transfer={transfer} />;
    }
  }

  if (transfer.status === COMMON_STATUS.INITIALIZE) {
    return (
      <BridgeConnectValidateStep
        successStatus={SYS_TO_ETH_TRANSFER_STATUS.BURN_SYS}
      />
    );
  } else if (transfer.status === SYS_TO_ETH_TRANSFER_STATUS.BURN_SYS) {
    return (
      <BridgeStepBurnSys
        successStatus={SYS_TO_ETH_TRANSFER_STATUS.CONFIRM_BURN_SYS}
      />
    );
  } else if (transfer.status === SYS_TO_ETH_TRANSFER_STATUS.CONFIRM_BURN_SYS) {
    return (
      <BridgeStepConfirmUTXOTransaction
        invalidStateMessage="Invalid State: Burn SYS transaction was not saved"
        loadingMessage="Confirming Burn of SYS transaction..."
        sourceStatus={SYS_TO_ETH_TRANSFER_STATUS.BURN_SYS}
        successStatus={SYS_TO_ETH_TRANSFER_STATUS.BURN_SYSX}
        confirmations={0}
      />
    );
  } else if (transfer.status === SYS_TO_ETH_TRANSFER_STATUS.BURN_SYSX) {
    return (
      <BridgeStepBurnSysx
        successStatus={SYS_TO_ETH_TRANSFER_STATUS.CONFIRM_BURN_SYSX}
        toNevm={true}
      />
    );
  } else if (transfer.status === SYS_TO_ETH_TRANSFER_STATUS.CONFIRM_BURN_SYSX) {
    return (
      <BridgeStepConfirmUTXOTransaction
        invalidStateMessage="Invalid State: Burn SYSX transaction was not saved"
        loadingMessage="Confirming Burn of SYSX transaction..."
        sourceStatus={SYS_TO_ETH_TRANSFER_STATUS.BURN_SYSX}
        successStatus={SYS_TO_ETH_TRANSFER_STATUS.GENERATE_PROOFS}
      />
    );
  } else if (transfer.status === SYS_TO_ETH_TRANSFER_STATUS.GENERATE_PROOFS) {
    return (
      <BridgeStepGenerateProofs
        successStatus={SYS_TO_ETH_TRANSFER_STATUS.SUBMIT_PROOFS}
      />
    );
  } else if (transfer.status === SYS_TO_ETH_TRANSFER_STATUS.SUBMIT_PROOFS) {
    return (
      <BridgeStepSubmitProofs successStatus={COMMON_STATUS.FINALIZING} />
    );
  } else if (transfer.status == COMMON_STATUS.FINALIZING) {
    return (
      <BridgeConfirmNEVMTransaction
        invalidStateMessage="Invalid State: Submit Proofs logs was not saved"
        loadingMessage="Confirming final transaction..."
        sourceStatus={SYS_TO_ETH_TRANSFER_STATUS.SUBMIT_PROOFS}
        successStatus={COMMON_STATUS.COMPLETED}
      />
    );
  } else if (transfer.status === "completed") {
    return <BridgeCompleteSysToNevm transfer={transfer} />;
  }

  return null;
};

export default BridgeStepSwitch;
