type BaseUtxoTransaction = {
  txId: string;
  clearAll: boolean;
  signedMessage: string;
};

export type AddBurnSysLogRequestPayload = {
  operation: "burn-sys";
} & BaseUtxoTransaction;

export type AddBurnSysxLogRequestPayload = {
  operation: "burn-sysx";
} & BaseUtxoTransaction;

export type AddLogRequestPayload =
  | AddBurnSysLogRequestPayload
  | AddBurnSysxLogRequestPayload;
