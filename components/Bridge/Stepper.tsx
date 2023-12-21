import { Alert, Step, StepLabel, Stepper } from "@mui/material";
import { useTransfer } from "contexts/Transfer/useTransfer";

const BridgeTransferStepper: React.FC = () => {
  const {
    transfer: { status },
    steps: mainSteps,
  } = useTransfer();
  const initializeStep = {
    id: "initialize",
    label: "Initialize",
  };
  const completeStep = {
    id: "completed",
    label: "Completed",
  };

  if (mainSteps.length === 0) {
    return <Alert severity="error">Invalid Transfer type</Alert>;
  }

  const steps = [initializeStep, ...mainSteps, completeStep];
  const activeStep = steps.findIndex((step) => step.id === status);

  return (
    <Stepper activeStep={activeStep || 0} alternativeLabel sx={{ mb: 2 }}>
      {steps.map((step) => (
        <Step key={step.id}>
          <StepLabel>{step.label}</StepLabel>
        </Step>
      ))}
    </Stepper>
  );
};

export default BridgeTransferStepper;
