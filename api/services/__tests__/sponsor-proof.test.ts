import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockFetchBackendSPVProof = jest.fn<any>();

jest.mock("syscoinjs-lib", () => ({
  utils: {
    fetchBackendSPVProof: mockFetchBackendSPVProof,
  },
}));

import { SPVProof } from "syscoinjs-lib";
import { getCanonicalProof } from "../sponsor-proof";
import { syscoinTxIdFromWitnessStrippedHex } from "utils/syscoin-txid";

const transaction = "01000000";
const submittedProof = {
  transaction,
  chainlock: true,
} as SPVProof;

describe("canonical sponsored SPV proof", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("accepts a canonical backend proof without requiring a ChainLock", async () => {
    const canonicalProof = { ...submittedProof, chainlock: false };
    mockFetchBackendSPVProof.mockResolvedValue({
      result: canonicalProof,
    });

    await expect(getCanonicalProof(submittedProof)).resolves.toEqual({
      proof: canonicalProof,
      sourceTxHash: syscoinTxIdFromWitnessStrippedHex(transaction),
    });
  });

  it("returns a server-fetched proof for the same source transaction", async () => {
    const canonicalProof = {
      ...submittedProof,
      blockhash: "canonical-block",
    };
    mockFetchBackendSPVProof.mockResolvedValue({ result: canonicalProof });

    await expect(getCanonicalProof(submittedProof)).resolves.toEqual({
      proof: canonicalProof,
      sourceTxHash: syscoinTxIdFromWitnessStrippedHex(transaction),
    });
  });

  it("rejects a backend response for a different transaction", async () => {
    mockFetchBackendSPVProof.mockResolvedValue({
      result: { ...submittedProof, transaction: "02000000" },
    });

    await expect(
      getCanonicalProof(submittedProof)
    ).rejects.toThrow("does not match the source transaction");
  });
});
