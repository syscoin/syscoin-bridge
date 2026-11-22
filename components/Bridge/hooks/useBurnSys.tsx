import burnSysToSysx from "@contexts/Transfer/functions/burnSysToSysx";
import { ITransfer } from "@contexts/Transfer/types";
import { useMutation } from "react-query";
import { useSyscoin } from "../context/Syscoin";
import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import { verifyTransferSigningIntent } from "../transfer-signing-intent";

export const useBurnSys = (transfer: ITransfer) => {
  const syscoinInstance = useSyscoin();
  const { sendTransaction } = usePaliWalletV2();
  return useMutation(["burnSys", transfer.id], {
    mutationFn: async () => {
      const intent = await verifyTransferSigningIntent(transfer);
      if (!intent.utxoXpub) {
        throw new Error("UTXO account information is missing");
      }
      const psbt = await burnSysToSysx(
        syscoinInstance,
        intent.amount,
        intent.utxoXpub,
        intent.utxoAddress
      );

      await verifyTransferSigningIntent(intent);
      const { tx, error } = await sendTransaction(psbt);

      if (error) {
        throw new Error(error);
      }
      return tx;
    },
  });
};
