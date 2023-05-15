import { Alert, Step, StepLabel, Stepper } from "@mui/material";
import { TransferStatus } from "contexts/Transfer/types";
import { useTransfer } from "contexts/Transfer/useTransfer";
import { useMemo } from "react";

interface Step {
  id: TransferStatus;
  label: string;
}

const sysToNevmSteps: Step[] = [
  {
    id: "burn-sys",
    label: "Burn SYS",
  },
  {
    id: "confirm-burn-sys",
    label: "Confirm Burn SYS",
  },
  {
    id: "burn-sysx",
    label: "Burn SYSX",
  },
  {
    id: "confirm-burn-sysx",
    label: "Confirm Burn SYSX",
  },
  {
    id: "generate-proofs",
    label: "Generate Proofs",
  },
  {
    id: "submit-proofs",
    label: "Submit Proofs",
  },
  {
    id: "finalizing",
    label: "Finalizing",
  },
];

const nevmToSysSteps: Step[] = [
  {
    id: "freeze-burn-sys",
    label: "Freeze and Burn (NEVM)",
  },
  {
    id: "confirm-freeze-burn-sys",
    label: "Confirm Freeze and Burn (NEVM)",
  },
  {
    id: "mint-sysx",
    label: "Mint SYSX",
  },
  {
    id: "confirm-mint-sysx",
    label: "Confirm Mint SYSX",
  },
  {
    id: "burn-sysx",
    label: "Burn SYSX to SYS",
  },
  {
    id: "finalizing",
    label: "Finalizing",
  },
];

type BridgeTransferStepperProps = {
  version?: "v1" | "v2";
};

const BridgeTransferStepper: React.FC<BridgeTransferStepperProps> = (
  { version } = { version: "v1" }
) => {
  const {
    transfer: { type, status },
  } = useTransfer();
  const initializeStep = {
    id: "initialize",
    label: "Initialize",
  };
  const completeStep = {
    id: "completed",
    label: "Completed",
  };
  const mainSteps: Step[] = useMemo(() => {
    let conditionalSteps = [];
    if (type === "sys-to-nevm") {
      conditionalSteps = [...sysToNevmSteps];
    } else if (type === "nevm-to-sys") {
      conditionalSteps = [...nevmToSysSteps];
    } else {
      return [] as Step[];
    }

    if (version === "v2") {
      if (type === "sys-to-nevm") {
        const submitProofsIndex = conditionalSteps.findIndex(
          (step) => step.id === "submit-proofs"
        );
        const switchStep: Step = {
          id: "switch",
          label: "Switch to NEVM",
        };

        conditionalSteps.splice(submitProofsIndex, 0, switchStep);
      } else if (type === "nevm-to-sys") {
        const mintSysxIndex = conditionalSteps.findIndex(
          (step) => step.id === "mint-sysx"
        );
        const switchStep: Step = {
          id: "switch",
          label: "Switch to SYSCOIN",
        };

        conditionalSteps.splice(mintSysxIndex, 0, switchStep);
      }
    }
    return conditionalSteps;
  }, [type, version]);

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
