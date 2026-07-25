import { ITransfer } from "@contexts/Transfer/types";
import { useMutation } from "react-query";
import { buildApiUrl } from "utils/api-base-url";

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
      ).then((res) => {
        if (res.ok) {
          return res.json();
        }
        return res.json().then(({ message }) => Promise.reject(message));
      });

      // The backend durably stores and broadcasts the signed transaction before
      // returning. The browser only observes the accepted transaction hash.
      return sponsorWalletTransaction.transaction.hash;
    },
    {
      onSuccess: (data: string) => {
        onSuccess(data);
      },
      retry: 3,
    }
  );
};

export default useSyscoinSubmitProofs;
