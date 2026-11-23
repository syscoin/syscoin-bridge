import { ITransfer } from "@contexts/Transfer/types";

export type Change = {
  property: keyof ITransfer;
  from: any;
  to: any;
};
