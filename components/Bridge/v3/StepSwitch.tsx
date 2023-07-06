import BridgeV3StepBurnSys from "./Steps/BurnSys";
import BridgeV3StepConfirmBurnSys from "./Steps/ConfirmBurnSys";
import BridgeV3ConnectValidateStep from "./Steps/ConnectValidate";
import { useTransfer } from "./context/TransferContext";

const BridgeV3StepSwitch = () => {
  const { transfer } = useTransfer();
  if (transfer.status === "initialize") {
    return <BridgeV3ConnectValidateStep successStatus="burn-sys" />;
  } else if (transfer.status === "burn-sys") {
    return <BridgeV3StepBurnSys successStatus="confirm-burn-sys" />;
  } else if (transfer.status === "confirm-burn-sys") {
    return <BridgeV3StepConfirmBurnSys successStatus="burn-sysx" />;
  }
  return null;
};

export default BridgeV3StepSwitch;
