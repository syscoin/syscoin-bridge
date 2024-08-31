import { Step, StepLabel, Stepper } from "@mui/material";
import { nevmToSysSteps, sysToNevmSteps } from "./constants/steps";
import { useTransfer } from "./context/TransferContext";
import {
  COMMON_STATUS,
  ETH_TO_SYS_TRANSFER_STATUS,
  SYS_TO_ETH_TRANSFER_STATUS,
} from "@contexts/Transfer/types";

const NEVMToSYSStepper: React.FC<{ activeStep: number }> = ({ activeStep }) => (
  <Stepper activeStep={activeStep}>
    <Step key="connect-and-validate">
      <StepLabel>Connect and Validated</StepLabel>
    </Step>
    <Step key="freeze-and-burn">
      <StepLabel>Freeze SYS</StepLabel>
    </Step>
    <Step key="mint-sys">
      <StepLabel>Mint SYS</StepLabel>
    </Step>
    <Step key="Completed">
      <StepLabel>Completed</StepLabel>
    </Step>
  </Stepper>
);

const SYSToNEVMStepper: React.FC<{ activeStep: number }> = ({ activeStep }) => {
  const { transfer } = useTransfer();
  return (
    <Stepper activeStep={activeStep}>
      <Step key="connect-and-validate">
        <StepLabel>Connect and Validated</StepLabel>
      </Step>
      <Step key="burn-sys">
        <StepLabel>Burn SYS</StepLabel>
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

const BridgeStepper: React.FC = () => {
  const {
    transfer: { type, status },
  } = useTransfer();
  let activeStep = 1;
  let modifiedStatus = status;

  if (type === "nevm-to-sys") {
    if (modifiedStatus === ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_FREEZE_BURN_SYS) {
      modifiedStatus = ETH_TO_SYS_TRANSFER_STATUS.FREEZE_BURN_SYS;
    } else if (modifiedStatus === COMMON_STATUS.FINALIZING) {
      modifiedStatus = ETH_TO_SYS_TRANSFER_STATUS.MINT_SYS;
    }
    activeStep = nevmToSysSteps.findIndex((step) => step === modifiedStatus);
    return <NEVMToSYSStepper activeStep={activeStep} />;
  }

  if (modifiedStatus === SYS_TO_ETH_TRANSFER_STATUS.CONFIRM_BURN_SYS) {
    modifiedStatus = SYS_TO_ETH_TRANSFER_STATUS.BURN_SYS;
  } else if (
    modifiedStatus === COMMON_STATUS.FINALIZING ||
    modifiedStatus === SYS_TO_ETH_TRANSFER_STATUS.GENERATE_PROOFS
  ) {
    modifiedStatus = SYS_TO_ETH_TRANSFER_STATUS.SUBMIT_PROOFS;
  }

  activeStep = sysToNevmSteps.findIndex((step) => step === modifiedStatus);
  return <SYSToNEVMStepper activeStep={activeStep} />;
};

export default BridgeStepper;
