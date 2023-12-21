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
      const sponsorWalletTransaction: ISponsorWalletTransaction = await fetch(
        `/api/transfer/${transfer.id}/signed-submit-proofs-tx`
      ).then((res) => {
        if (res.ok) {
          return res.json();
        }
        return res.json().then(({ message }) => Promise.reject(message));
      });

      const receipt = await web3.eth.getTransactionReceipt(
        sponsorWalletTransaction.transaction.hash,
      );

      if (receipt) {
        return receipt.transactionHash;
      }

      return new Promise<string>((resolve, reject) => {
        const method = web3.eth.sendSignedTransaction(
          sponsorWalletTransaction.transaction.rawData
        );
        method
          .once("transactionHash", (hash: string | { success: false }) => {
            if (typeof hash === "string") {
              return resolve(hash);
            }
            if (!hash.success) {
              reject("Failed to submit proofs. Check browser logs");
              console.error("Submission failed", hash);
            }
          })
          .on("error", (error: { message: string }) => {
            if (/might still be mined/.test(error.message)) {
              resolve("");
            } else {
              console.error(error);
              reject(error);
            }
          });
      });
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
