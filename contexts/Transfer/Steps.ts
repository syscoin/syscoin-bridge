import { COMMON_STATUS, ETH_TO_SYS_TRANSFER_STATUS, SYS_TO_ETH_TRANSFER_STATUS, TransferStatus } from "./types";

export interface TransferStep {
  id: TransferStatus;
  label: string;
}

export const sysToNevmSteps: TransferStep[] = [
  {
    id: SYS_TO_ETH_TRANSFER_STATUS.BURN_SYS,
    label: "Burn SYS to SYSX",
  },
  {
    id: SYS_TO_ETH_TRANSFER_STATUS.CONFIRM_BURN_SYS,
    label: "Wait for SYS burn",
  },
  {
    id: SYS_TO_ETH_TRANSFER_STATUS.BURN_SYSX,
    label: "Burn SYSX",
  },
  {
    id: SYS_TO_ETH_TRANSFER_STATUS.CONFIRM_BURN_SYSX,
    label: "Wait for SYSX burn",
  },
  {
    id: SYS_TO_ETH_TRANSFER_STATUS.GENERATE_PROOFS,
    label: "Generate proof",
  },
  {
    id: SYS_TO_ETH_TRANSFER_STATUS.SUBMIT_PROOFS,
    label: "Submit proof",
  },
  {
    id: COMMON_STATUS.FINALIZING,
    label: "Finalize transfer",
  },
];

export const nevmToSysSteps: TransferStep[] = [
  {
    id: ETH_TO_SYS_TRANSFER_STATUS.FREEZE_BURN_SYS,
    label: "Freeze and burn SYS",
  },
  {
    id: ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_FREEZE_BURN_SYS,
    label: "Wait for freeze and burn",
  },
  {
    id: ETH_TO_SYS_TRANSFER_STATUS.MINT_SYSX,
    label: "Mint SYSX",
  },
  {
    id: ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_MINT_SYSX,
    label: "Wait for SYSX mint",
  },
  {
    id: ETH_TO_SYS_TRANSFER_STATUS.BURN_SYSX,
    label: "Burn SYSX to SYS",
  },
  {
    id: COMMON_STATUS.FINALIZING,
    label: "Finalize transfer",
  },
];
