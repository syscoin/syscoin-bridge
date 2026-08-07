import { describe, expect, it } from "@jest/globals";
import {
  assertProofBlockIsHistorical,
  MAX_PROOF_BLOCK_RETRIES,
  ProofBlockPendingError,
  PROOF_BLOCK_RETRY_DELAY_MS,
  proofSubmissionRetryDelay,
  shouldRetryPendingProof,
} from "./proof-submission";

describe("proof submission block readiness", () => {
  it("accepts a proof only after its NEVM block becomes historical", () => {
    expect(() => assertProofBlockIsHistorical(100, 101)).not.toThrow();
    expect(() => assertProofBlockIsHistorical(100, 100)).toThrow(
      ProofBlockPendingError
    );
    expect(() => assertProofBlockIsHistorical(101, 100)).toThrow(
      ProofBlockPendingError
    );
  });

  it("retries only the transient proof-block condition", () => {
    const pending = new ProofBlockPendingError();

    expect(shouldRetryPendingProof(0, pending)).toBe(true);
    expect(shouldRetryPendingProof(MAX_PROOF_BLOCK_RETRIES, pending)).toBe(
      false
    );
    expect(shouldRetryPendingProof(0, new Error("permanent"))).toBe(false);
    expect(proofSubmissionRetryDelay(0, pending)).toBe(
      PROOF_BLOCK_RETRY_DELAY_MS
    );
  });
});
