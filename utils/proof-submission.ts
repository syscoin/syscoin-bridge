export const PROOF_BLOCK_PENDING_CODE = "NEVM_PROOF_BLOCK_PENDING";
export const PROOF_BLOCK_RETRY_DELAY_MS = 10_000;
export const MAX_PROOF_BLOCK_RETRIES = 90;

export class ProofBlockPendingError extends Error {
  public readonly code = PROOF_BLOCK_PENDING_CODE;
  public readonly retryAfterMs: number;

  constructor(
    message = "Waiting for the next NEVM block before submitting the proof.",
    retryAfterMs = PROOF_BLOCK_RETRY_DELAY_MS
  ) {
    super(message);
    this.name = "ProofBlockPendingError";
    this.retryAfterMs = retryAfterMs;
    Object.setPrototypeOf(this, ProofBlockPendingError.prototype);
  }
}

export const assertProofBlockIsHistorical = (
  proofBlockNumber: number,
  latestBlockNumber: number
) => {
  if (proofBlockNumber >= latestBlockNumber) {
    throw new ProofBlockPendingError();
  }
};

export const isProofBlockPendingError = (
  error: unknown
): error is ProofBlockPendingError =>
  error instanceof ProofBlockPendingError ||
  (typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === PROOF_BLOCK_PENDING_CODE);

const wait = (delayMs: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, delayMs));

export const retryPendingProof = async <T>(
  operation: () => Promise<T>,
  waitForRetry = wait
): Promise<T> => {
  for (let failureCount = 0; ; failureCount += 1) {
    try {
      return await operation();
    } catch (error) {
      if (
        !isProofBlockPendingError(error) ||
        failureCount >= MAX_PROOF_BLOCK_RETRIES
      ) {
        throw error;
      }
      await waitForRetry(error.retryAfterMs);
    }
  }
};
