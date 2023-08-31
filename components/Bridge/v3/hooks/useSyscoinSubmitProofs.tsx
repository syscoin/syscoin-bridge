import { ITransfer } from "@contexts/Transfer/types";
import { useMutation } from "react-query";
import { useWeb3 } from "../context/Web";

const useSyscoinSubmitProofs = (
  transfer: ITransfer,
  onSuccess: (hash: string) => void
) => {
  const web3 = useWeb3();
  return useMutation(
    ["syscoin-submit-proofs", transfer.id],
    async () => {
      const submitProofsResponse: { signedTx: string } = await fetch(
        `/api/transfer/${transfer.id}/signed-submit-proofs-tx`
      ).then((res) => {
        if (res.ok) {
          return res.json();
        }
        return res.json().then(({ message }) => Promise.reject(message));
      });

      const { signedTx } = submitProofsResponse;

      return new Promise((resolve, reject) => {
        web3.eth
          .sendSignedTransaction(signedTx)
          .once("transactionHash", (hash: string | { success: false }) => {
            if (typeof hash !== "string" && !hash.success) {
              reject("Failed to submit proofs. Check browser logs");
              console.error("Submission failed", hash);
            } else {
              resolve(hash);
            }
          })
          .on("error", (error: { message: string }) => {
            if (/might still be mined/.test(error.message)) {
              resolve("");
            } else {
              console.error(error);
              reject(error.message);
            }
          });
      });
    },
    {
      onSuccess: (data) => {
        onSuccess(data as string);
      },
    }
  );
};

export default useSyscoinSubmitProofs;
