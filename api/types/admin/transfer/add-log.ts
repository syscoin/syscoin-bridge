type BaseLog = {
  clearAll: boolean;
  signedMessage: string;
};

type BaseUtxoTransaction = {
  txId: string;
} & BaseLog;

type BaseEVMTransaction = {
  txHash: string;
} & BaseLog;

export type AddBurnSysLogRequestPayload = {
  operation: "burn-sys";
} & BaseUtxoTransaction;

export type AddBurnSysxLogRequestPayload = {
  operation: "burn-sysx";
} & BaseUtxoTransaction;

export type AddSubmitProofsLogRequestPayload = {
  operation: "submit-proofs";
} & BaseEVMTransaction;

export type AddUTXOLogRequestPayload =
  | AddBurnSysLogRequestPayload
  | AddBurnSysxLogRequestPayload;

export type AddNEVMLogRequestPayload = AddSubmitProofsLogRequestPayload;

export type AddLogRequestPayload =
  | AddUTXOLogRequestPayload
  | AddNEVMLogRequestPayload;
