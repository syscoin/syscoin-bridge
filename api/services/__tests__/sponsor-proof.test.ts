import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockFetchBackendSPVProof = jest.fn<any>();

jest.mock("syscoinjs-lib", () => ({
  utils: {
    fetchBackendSPVProof: mockFetchBackendSPVProof,
  },
}));

import { SPVProof } from "syscoinjs-lib";
import { getCanonicalChainLockedProof } from "../sponsor-proof";
import { syscoinTxIdFromWitnessStrippedHex } from "utils/syscoin-txid";

const transaction = "01000000";
const submittedProof = {
  transaction,
  chainlock: true,
} as SPVProof;

describe("canonical sponsored SPV proof finality", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("ignores a client-supplied finality label and rejects a non-ChainLocked backend proof", async () => {
    mockFetchBackendSPVProof.mockResolvedValue({
      result: { ...submittedProof, chainlock: false },
    });

    await expect(
      getCanonicalChainLockedProof(submittedProof)
    ).rejects.toThrow("Source transaction is not ChainLocked");
  });

  it("returns a server-fetched ChainLocked proof for the same source transaction", async () => {
    const canonicalProof = {
      ...submittedProof,
      blockhash: "canonical-block",
    };
    mockFetchBackendSPVProof.mockResolvedValue({ result: canonicalProof });

    await expect(getCanonicalChainLockedProof(submittedProof)).resolves.toEqual({
      proof: canonicalProof,
      sourceTxHash: syscoinTxIdFromWitnessStrippedHex(transaction),
    });
  });

  it("rejects a backend response for a different transaction", async () => {
    mockFetchBackendSPVProof.mockResolvedValue({
      result: { ...submittedProof, transaction: "02000000" },
    });

    await expect(
      getCanonicalChainLockedProof(submittedProof)
    ).rejects.toThrow("does not match the source transaction");
  });
});
