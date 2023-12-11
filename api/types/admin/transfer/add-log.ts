export type AddBurnSysLogRequestPayload = {
  operation: "burn-sys";
  txId: string;
  clearAll: boolean;
  signedMessage: string;
};

export type AddLogRequestPayload = AddBurnSysLogRequestPayload;
