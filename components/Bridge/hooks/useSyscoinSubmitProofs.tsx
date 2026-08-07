import { ITransfer } from "@contexts/Transfer/types";
import { useMutation } from "react-query";
import { buildApiUrl } from "utils/api-base-url";
import {
  ProofBlockPendingError,
  PROOF_BLOCK_PENDING_CODE,
  proofSubmissionRetryDelay,
  shouldRetryPendingProof,
} from "utils/proof-submission";

const useSyscoinSubmitProofs = (
  transfer: ITransfer,
  onSuccess: (hash: string) => void
) => {
  return useMutation(
    ["syscoin-submit-proofs", transfer.id],
    async () => {
      const sponsorWalletTransaction: {
        transaction: { hash: string };
      } = await fetch(
        buildApiUrl(`/api/transfer/${transfer.id}/signed-submit-proofs-tx`)
      ).then(async (res) => {
        if (res.ok) {
          return res.json();
        }
        const error = await res.json();
        if (error.code === PROOF_BLOCK_PENDING_CODE) {
          throw new ProofBlockPendingError(error.message, error.retryAfterMs);
        }
        throw new Error(error.message ?? "Proof submission failed");
      });

      // The backend durably stores and broadcasts the signed transaction before
      // returning. The browser only observes the accepted transaction hash.
      return sponsorWalletTransaction.transaction.hash;
    },
    {
      onSuccess,
      retry: (failureCount, error) =>
        shouldRetryPendingProof(failureCount, error) || failureCount < 3,
      retryDelay: proofSubmissionRetryDelay,
    }
  );
};

export default useSyscoinSubmitProofs;
