import { TransferStatus, TransferType } from "@contexts/Transfer/types";
import { Step, StepLabel, Stepper } from "@mui/material";
import { sysToNevmSteps } from "./contants/steps";

type BridgeV3StepperProps = {
  transferType: TransferType;
  transferStatus: TransferStatus;
};

const NEVMToSYSStepper: React.FC<{ activeStep: number }> = ({ activeStep }) => (
  <Stepper activeStep={activeStep}>
    <Step key="connect-and-validate">
      <StepLabel>Connect and Validated</StepLabel>
    </Step>
    <Step key="freeze-and-burn">
      <StepLabel>Freeze and Burn SYS</StepLabel>
    </Step>
    <Step key="mint-sysx">
      <StepLabel>Mint SYSX</StepLabel>
    </Step>
    <Step key="burn-sysx">
      <StepLabel>Burn SYSX</StepLabel>
    </Step>
    <Step key="Completed">
      <StepLabel>Completed</StepLabel>
    </Step>
  </Stepper>
);

const SYSToNEVMStepper: React.FC<{ activeStep: number }> = ({ activeStep }) => (
  <Stepper activeStep={activeStep}>
    <Step key="connect-and-validate">
      <StepLabel>Connect and Validated</StepLabel>
    </Step>
    <Step key="burn-sys">
      <StepLabel>Burn SYS</StepLabel>
    </Step>
    <Step key="burn-sysx">
      <StepLabel>Burn SYSX</StepLabel>
    </Step>
    <Step key="validate-proofs">
      <StepLabel>Validate Proofs</StepLabel>
    </Step>
    <Step key="Completed">
      <StepLabel>Completed</StepLabel>
    </Step>
  </Stepper>
);

const BridgeV3Stepper: React.FC<BridgeV3StepperProps> = ({
  transferType,
  transferStatus,
}) => {
  let activeStep = 1;
  if (transferType === "nevm-to-sys") {
    return <NEVMToSYSStepper activeStep={activeStep} />;
  }

  let modifiedStatus = transferStatus;

  if (modifiedStatus === "confirm-burn-sys") {
    modifiedStatus = "burn-sys";
  } else if (modifiedStatus === "confirm-burn-sysx") {
    modifiedStatus = "burn-sysx";
  } else if (modifiedStatus === "finalizing") {
    modifiedStatus = "submit-proofs";
  }

  activeStep = sysToNevmSteps.findIndex((step) => step === modifiedStatus);

  return <SYSToNEVMStepper activeStep={activeStep} />;
};

export default BridgeV3Stepper;
