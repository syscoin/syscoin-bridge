import { TransferStatus } from "./types";

export interface TransferStep {
  id: TransferStatus;
  label: string;
}

export const sysToNevmSteps: TransferStep[] = [
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

export const nevmToSysSteps: TransferStep[] = [
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
