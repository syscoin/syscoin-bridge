import { SYSX_ASSET_GUID } from "@contexts/Transfer/constants";
import type { ITransfer } from "@contexts/Transfer/types";
import { SPVProof, utils as syscoinUtils } from "syscoinjs-lib";
import { ProofSponsorshipUnavailableError } from "utils/proof-submission";
import { toSyscoinBaseUnits } from "utils/syscoin-amount";
import {
  MAINNET_BLOCKBOOK_URL,
  resolveUtxoBlockbookUrl,
} from "utils/syscoin-urls";
import { syscoinTxIdFromWitnessStrippedHex } from "utils/syscoin-txid";

const { bufferUtils } = require("syscointx-js") as {
  bufferUtils: {
    deserializeAllocationBurn: (payload: Buffer, extractMemo: boolean) => {
      allocation: {
        assetGuid: string;
        values: { n: number; value: { toString(): string } }[];
      }[];
      ethaddress: Buffer;
    };
  };
};

export const getSponsoredProofMinimum = (): bigint => {
  if (!process.env.MINIMUM_AMOUNT) {
    throw new ProofSponsorshipUnavailableError("Foundation proof sponsorship minimum is not configured");
  }
  try {
    return BigInt(toSyscoinBaseUnits(process.env.MINIMUM_AMOUNT));
  } catch {
    throw new ProofSponsorshipUnavailableError("Foundation proof sponsorship minimum is invalid");
  }
};

export const assertSponsoredProofBurn = (
  transfer: ITransfer,
  proof: SPVProof,
  minimum: bigint
): void => {
  const tx = syscoinUtils.bitcoinjs.Transaction.fromHex(proof.transaction);
  const outputIndex = tx.outs.findIndex((output: { script: Uint8Array }) => output.script[0] === 0x6a);
  const payload = outputIndex < 0
    ? undefined
    : syscoinUtils.bitcoinjs.script.decompile(tx.outs[outputIndex].script)?.[1];
  if (tx.version !== 141 || !(payload instanceof Uint8Array)) {
    throw new Error("Proof is missing a SYSX burn to NEVM");
  }

  const burn = bufferUtils.deserializeAllocationBurn(Buffer.from(payload), true);
  const burnAmount = burn.allocation
    .filter(({ assetGuid }) => String(assetGuid) === SYSX_ASSET_GUID)
    .flatMap(({ values }) => values.filter(({ n }) => n === outputIndex));
  const expectedAmount = toSyscoinBaseUnits(transfer.amount);
  if (
    burnAmount.length !== 1 ||
    burnAmount[0].value.toString() !== expectedAmount ||
    `0x${burn.ethaddress.toString("hex")}` !== transfer.nevmAddress?.toLowerCase()
  ) {
    throw new Error("SYSX burn does not match this transfer");
  }
  if (BigInt(expectedAmount) < minimum) {
    throw new ProofSponsorshipUnavailableError("SYSX burn is below the foundation proof sponsorship minimum");
  }
};

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
