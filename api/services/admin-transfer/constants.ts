import { BlockbookAPIURL } from "@contexts/Transfer/constants";
import { utils as syscoinUtils } from "syscoinjs-lib";

export const CONFIRM_UTXO_TRANSACTION = "Confirm UTXO Transaction";

export const verifyTx = async (
  txId: string
) => {
  const rawTransaction = await syscoinUtils.fetchBackendRawTx(
    BlockbookAPIURL,
    txId
  );

  return rawTransaction;
};
