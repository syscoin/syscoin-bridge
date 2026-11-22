import { ITransfer } from "@contexts/Transfer/types";

export const isTransfer = (obj: any): obj is ITransfer => {
  return (
    obj &&
    typeof obj.id === "string" &&
    (obj.utxoXpub === undefined || typeof obj.utxoXpub === "string") &&
    typeof obj.utxoAddress === "string" &&
    typeof obj.nevmAddress === "string" &&
    typeof obj.status === "string" &&
    typeof obj.amount !== "undefined" &&
    !isNaN(parseInt(obj.amount))
  );
};

export default isTransfer;
