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

export const shouldRetryPendingProof = (
  failureCount: number,
  error: unknown
) =>
  isProofBlockPendingError(error) && failureCount < MAX_PROOF_BLOCK_RETRIES;

export const proofSubmissionRetryDelay = (
  failureCount: number,
  error: unknown
) =>
  isProofBlockPendingError(error) && "retryAfterMs" in error
    ? error.retryAfterMs
    : Math.min(1_000 * 2 ** failureCount, 30_000);
