import BridgeV3StepBurnSys from "./Steps/BurnSys";
import BridgeV3StepBurnSysx from "./Steps/BurnSysx";
import BridgeV3CompleteSysToNevm from "./Steps/CompleteSysToNevm";
import BridgeV3StepConfirmBurnSys from "./Steps/ConfirmBurnSys";
import BridgeV3StepConfirmBurnSysx from "./Steps/ConfirmBurnSysx";
import BridgeV3ConfirmNEVMTransaction from "./Steps/ConfirmNEVMTransaction";
import BridgeV3ConnectValidateStep from "./Steps/ConnectValidate";
import BridgeV3StepGenerateProofs from "./Steps/GenerateProofs";
import BridgeV3StepSubmitProofs from "./Steps/SubmitProofs";
import { useTransfer } from "./context/TransferContext";

const BridgeV3StepSwitch = () => {
  const { transfer } = useTransfer();
  if (transfer.status === "initialize") {
    return <BridgeV3ConnectValidateStep successStatus="burn-sys" />;
  } else if (transfer.status === "burn-sys") {
    return <BridgeV3StepBurnSys successStatus="confirm-burn-sys" />;
  } else if (transfer.status === "confirm-burn-sys") {
    return <BridgeV3StepConfirmBurnSys successStatus="burn-sysx" />;
  } else if (transfer.status === "burn-sysx") {
    return <BridgeV3StepBurnSysx successStatus="confirm-burn-sysx" />;
  } else if (transfer.status === "confirm-burn-sysx") {
    return <BridgeV3StepConfirmBurnSysx successStatus="generate-proofs" />;
  } else if (transfer.status === "generate-proofs") {
    return <BridgeV3StepGenerateProofs successStatus="submit-proofs" />;
  } else if (transfer.status === "submit-proofs") {
    return <BridgeV3StepSubmitProofs successStatus="finalizing" />;
  } else if (transfer.status == "finalizing") {
    return (
      <BridgeV3ConfirmNEVMTransaction
        invalidStateMessage="Invalid State: Submit Proofs logs was not saved"
        loadingMessage="Confirming final transaction..."
        sourceStatus="submit-proofs"
        successStatus="completed"
      />
    );
  } else if (transfer.status === "completed") {
    if (transfer.type === "sys-to-nevm") {
      return <BridgeV3CompleteSysToNevm transfer={transfer} />;
    }
  }

  return null;
};

export default BridgeV3StepSwitch;
