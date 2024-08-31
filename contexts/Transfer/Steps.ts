import { COMMON_STATUS, ETH_TO_SYS_TRANSFER_STATUS, SYS_TO_ETH_TRANSFER_STATUS, TransferStatus } from "./types";

export interface TransferStep {
  id: TransferStatus;
  label: string;
}

export const sysToNevmSteps: TransferStep[] = [
  {
    id: SYS_TO_ETH_TRANSFER_STATUS.BURN_SYS,
    label: "Burn SYS",
  },
  {
    id: SYS_TO_ETH_TRANSFER_STATUS.CONFIRM_BURN_SYS,
    label: "Confirm Burn SYS",
  },
  {
    id: SYS_TO_ETH_TRANSFER_STATUS.GENERATE_PROOFS,
    label: "Generate Proofs",
  },
  {
    id: SYS_TO_ETH_TRANSFER_STATUS.SUBMIT_PROOFS,
    label: "Submit Proofs",
  },
  {
    id: COMMON_STATUS.FINALIZING,
    label: "Finalizing",
  },
];

export const nevmToSysSteps: TransferStep[] = [
  {
    id: ETH_TO_SYS_TRANSFER_STATUS.FREEZE_BURN_SYS,
    label: "Freeze (NEVM)",
  },
  {
    id: ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_FREEZE_BURN_SYS,
    label: "Confirm Freeze (NEVM)",
  },
  {
    id: ETH_TO_SYS_TRANSFER_STATUS.MINT_SYS,
    label: "Mint SYS",
  },
  {
    id: COMMON_STATUS.FINALIZING,
    label: "Finalizing",
  },
];
