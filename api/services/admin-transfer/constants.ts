import { BlockbookAPIURL } from "@contexts/Transfer/constants";
import { utils as syscoinUtils } from "syscoinjs-lib";

export const CONFIRM_UTXO_TRANSACTION = "Confirm UTXO Transaction";
export const BURN_SYS_TOKEN_TYPE = "SPTSyscoinBurnToAssetAllocation";
export const BURN_SYSX_TOKEN_TYPE = "SPTAssetAllocationBurnToNEVM";

export const verifyTxTokenTransfer = async (
  txId: string,
  tokenType: string
) => {
  const rawTransaction = await syscoinUtils.fetchBackendRawTx(
    BlockbookAPIURL,
    txId
  );

  return rawTransaction.tokenType === tokenType ? rawTransaction : null;
};
