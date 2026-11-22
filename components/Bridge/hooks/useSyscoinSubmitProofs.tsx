import { ITransfer } from "@contexts/Transfer/types";
import { useMutation } from "react-query";
import {
  ProofBlockPendingError,
  PROOF_BLOCK_PENDING_CODE,
  ProofSponsorshipUnavailableError,
  PROOF_SPONSORSHIP_UNAVAILABLE_CODE,
  isProofBlockPendingError,
  retryPendingProof,
} from "utils/proof-submission";
import { getTransferWriteToken } from "utils/transfer-write-token";
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
        const writeToken = getTransferWriteToken(transfer.id);
        const res = await fetch(
          `/api/transfer/${encodeURIComponent(transfer.id)}/signed-submit-proofs-tx`,
          {
            method: "POST",
            cache: "no-store",
            credentials: "same-origin",
            redirect: "error",
            headers: writeToken ? { Authorization: `Bearer ${writeToken}` } : {},
          }
        );
        if (res.ok) {
          return res.json();
        }
        const error = await res.json();
        if (res.status === 401) {
          throw new TransferSigningIntentError(error.message ?? "Transfer write is not authorized");
        }
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
