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

export type AddMintSysLogRequestPayload = {
  operation: "mint-sys";
} & BaseUtxoTransaction;

export type AddSubmitProofsLogRequestPayload = {
  operation: "submit-proofs";
} & BaseEVMTransaction;

export type AddFreezeAndBurnLogRequestPayload = {
  operation: "freeze-burn-sys";
} & BaseEVMTransaction;

export type AddUTXOLogRequestPayload =
  | AddBurnSysLogRequestPayload
  | AddMintSysLogRequestPayload;

export type AddNEVMLogRequestPayload =
  | AddSubmitProofsLogRequestPayload
  | AddFreezeAndBurnLogRequestPayload;

export type AddLogRequestPayload =
  | AddUTXOLogRequestPayload
  | AddNEVMLogRequestPayload;
