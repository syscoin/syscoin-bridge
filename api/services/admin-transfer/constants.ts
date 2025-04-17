import { utils as syscoinUtils } from "syscoinjs-lib";

export const CONFIRM_UTXO_TRANSACTION = "Confirm UTXO Transaction";
export const BURN_SYS_TOKEN_TYPE = "SPTSyscoinBurnToAssetAllocation";
export const BURN_SYSX_TOKEN_TYPE = "SPTAssetAllocationBurnToNEVM";
export const MINT_SYSX_TOKEN_TYPE = "SPTAssetAllocationMint";

export const verifyTxTokenTransfer = async (
  txId: string,
  tokenType: string
) => {
  const rawTransaction = await syscoinUtils.fetchBackendRawTx(
    process.env.UTXO_RPC_URL!,
    txId
  );

  return rawTransaction.tokenType === tokenType ? rawTransaction : null;
};
