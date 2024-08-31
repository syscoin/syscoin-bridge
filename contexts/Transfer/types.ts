export type TransferType = "sys-to-nevm" | "nevm-to-sys";

export enum COMMON_STATUS {
  INITIALIZE = "initialize",
  FINALIZING = "finalizing",
  COMPLETED = "completed",
  ERROR = "error",
}

export type SysToEthTransferStatus =
  | COMMON_STATUS.INITIALIZE
  | SYS_TO_ETH_TRANSFER_STATUS.BURN_SYS
  | SYS_TO_ETH_TRANSFER_STATUS.CONFIRM_BURN_SYS
  | SYS_TO_ETH_TRANSFER_STATUS.GENERATE_PROOFS
  | SYS_TO_ETH_TRANSFER_STATUS.SUBMIT_PROOFS
  | COMMON_STATUS.FINALIZING
  | COMMON_STATUS.COMPLETED
  | COMMON_STATUS.ERROR;

export enum SYS_TO_ETH_TRANSFER_STATUS {
  BURN_SYS = "burn-sys",
  CONFIRM_BURN_SYS = "confirm-burn-sys",
  GENERATE_PROOFS = "generate-proofs",
  SUBMIT_PROOFS = "submit-proofs",
}

export type EthToSysTransferStatus =
  | COMMON_STATUS.INITIALIZE
  | ETH_TO_SYS_TRANSFER_STATUS.FREEZE_BURN_SYS
  | ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_FREEZE_BURN_SYS
  | ETH_TO_SYS_TRANSFER_STATUS.MINT_SYS
  | COMMON_STATUS.FINALIZING
  | COMMON_STATUS.COMPLETED
  | COMMON_STATUS.ERROR;

export enum ETH_TO_SYS_TRANSFER_STATUS {
  FREEZE_BURN_SYS = "freeze-burn-sys",
  CONFIRM_FREEZE_BURN_SYS = "confirm-freeze-burn-sys",
  MINT_SYS = "mint-sys",
}

export type TransferStatus =
  | SysToEthTransferStatus
  | EthToSysTransferStatus
  | "switch";

export interface ITransferLog<T = any> {
  status: TransferStatus;
  payload: {
    message: string;
    data: T;
    previousStatus?: TransferStatus;
  };
  date: number;
}

export interface ITransfer {
  id: string;
  type: TransferType;
  status: TransferStatus;
  amount: string;
  logs: ITransferLog[];
  createdAt: number;
  updatedAt?: number;
  utxoAddress?: string;
  utxoXpub?: string;
  nevmAddress?: string;
  version: "v1" | "v2";
  agreedToTerms: boolean;
}
