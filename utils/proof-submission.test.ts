import { describe, expect, it, jest } from "@jest/globals";
import {
  assertProofBlockIsHistorical,
  ProofBlockPendingError,
  PROOF_BLOCK_RETRY_DELAY_MS,
  retryPendingProof,
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

  it("polls pending blocks within one operation", async () => {
    const operation = jest
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new ProofBlockPendingError())
      .mockRejectedValueOnce(new ProofBlockPendingError())
      .mockResolvedValueOnce("submitted");
    const waitForRetry = jest
      .fn<(delayMs: number) => Promise<void>>()
      .mockResolvedValue();

    await expect(
      retryPendingProof(operation, waitForRetry)
    ).resolves.toBe("submitted");
    expect(operation).toHaveBeenCalledTimes(3);
    expect(waitForRetry).toHaveBeenNthCalledWith(
      1,
      PROOF_BLOCK_RETRY_DELAY_MS
    );
    expect(waitForRetry).toHaveBeenCalledTimes(2);
  });

  it("returns a later non-pending failure to the caller", async () => {
    const error = new Error("network unavailable");
    const operation = jest
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new ProofBlockPendingError())
      .mockRejectedValueOnce(error);
    const waitForRetry = jest
      .fn<(delayMs: number) => Promise<void>>()
      .mockResolvedValue();

    await expect(retryPendingProof(operation, waitForRetry)).rejects.toBe(
      error
    );
    expect(operation).toHaveBeenCalledTimes(2);
    expect(waitForRetry).toHaveBeenCalledTimes(1);
  });
});
