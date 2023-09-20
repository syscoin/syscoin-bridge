import { ITransfer } from "@contexts/Transfer/types";
import { useMutation } from "react-query";
import { useWeb3 } from "../context/Web";
import { ISponsorWalletTransaction } from "models/sponsor-wallet-transactions";

const useSyscoinSubmitProofs = (
  transfer: ITransfer,
  onSuccess: (hash: string) => void
) => {
  const web3 = useWeb3();
  return useMutation(
    ["syscoin-submit-proofs", transfer.id],
    async () => {
      const submitProofsResponse: ISponsorWalletTransaction = await fetch(
        `/api/transfer/${transfer.id}/signed-submit-proofs-tx`
      ).then((res) => {
        if (res.ok) {
          return res.json();
        }
        return res.json().then(({ message }) => Promise.reject(message));
      });

      return submitProofsResponse.transactionHash;
    },
    {
      onSuccess: (data) => {
        onSuccess(data);
      },
    }
  );
};

export default useSyscoinSubmitProofs;
