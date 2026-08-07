import { SPVProof, utils as syscoinUtils } from "syscoinjs-lib";
import {
  MAINNET_BLOCKBOOK_URL,
  resolveUtxoBlockbookUrl,
} from "utils/syscoin-urls";
import { syscoinTxIdFromWitnessStrippedHex } from "utils/syscoin-txid";

const getUtxoBlockbookUrl = () =>
  resolveUtxoBlockbookUrl(process.env.UTXO_RPC_URL) ??
  resolveUtxoBlockbookUrl(process.env.UTXO_EXPLORER) ??
  MAINNET_BLOCKBOOK_URL;

const parseProof = (value: unknown): SPVProof => {
  const proof = typeof value === "string" ? JSON.parse(value) : value;
  if (
    !proof ||
    typeof proof !== "object" ||
    !("transaction" in proof) ||
    typeof proof.transaction !== "string"
  ) {
    throw new Error("Canonical SPV proof is unavailable");
  }
  return proof as SPVProof;
};

export const getCanonicalProof = async (
  submittedProof: SPVProof
): Promise<{ proof: SPVProof; sourceTxHash: string }> => {
  const sourceTxHash = syscoinTxIdFromWitnessStrippedHex(
    submittedProof.transaction
  );
  const response = await syscoinUtils.fetchBackendSPVProof(
    getUtxoBlockbookUrl(),
    sourceTxHash
  );
  const proof = parseProof(response?.result);
  const canonicalSourceTxHash = syscoinTxIdFromWitnessStrippedHex(
    proof.transaction
  );

  if (canonicalSourceTxHash !== sourceTxHash) {
    throw new Error("Canonical SPV proof does not match the source transaction");
  }

  return { proof, sourceTxHash };
};
