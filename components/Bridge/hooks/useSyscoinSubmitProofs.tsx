import { ITransfer } from "@contexts/Transfer/types";
import { useMutation } from "react-query";
import { buildApiUrl } from "utils/api-base-url";
import {
  ProofBlockPendingError,
  PROOF_BLOCK_PENDING_CODE,
  ProofSponsorshipUnavailableError,
  PROOF_SPONSORSHIP_UNAVAILABLE_CODE,
  isProofBlockPendingError,
  retryPendingProof,
} from "utils/proof-submission";
import {
  TransferSigningIntentError,
  verifyTransferSigningIntent,
} from "../transfer-signing-intent";

const useSyscoinSubmitProofs = (
  transfer: ITransfer,
  onSuccess: (hash: string) => void
) => {
  return useMutation(
    ["syscoin-submit-proofs", transfer.id],
    async () => {
      const sponsorWalletTransaction: {
        transaction: { hash: string };
      } = await retryPendingProof(async () => {
        await verifyTransferSigningIntent(transfer);
        const res = await fetch(
          buildApiUrl(
            `/api/transfer/${encodeURIComponent(transfer.id)}/signed-submit-proofs-tx`
          )
        );
        if (res.ok) {
          return res.json();
        }
        const error = await res.json();
        if (error.code === PROOF_BLOCK_PENDING_CODE) {
          throw new ProofBlockPendingError(error.message, error.retryAfterMs);
        }
        if (error.code === PROOF_SPONSORSHIP_UNAVAILABLE_CODE) {
          throw new ProofSponsorshipUnavailableError(error.message);
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
        !(error instanceof TransferSigningIntentError) &&
        !(error instanceof ProofSponsorshipUnavailableError) &&
        !isProofBlockPendingError(error) &&
        failureCount < 3,
    }
  );
};

export default useSyscoinSubmitProofs;
