import { TransferType } from "@contexts/Transfer/types";
import { Step, StepLabel, Stepper } from "@mui/material";

type BridgeV3StepperProps = {
  transferType: TransferType;
  activeStep: number;
};

const BridgeV3Stepper: React.FC<BridgeV3StepperProps> = ({
  transferType,
  activeStep,
}) => {
  if (transferType === "nevm-to-sys") {
    return (
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
  }
  return (
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
};

export default BridgeV3Stepper;
