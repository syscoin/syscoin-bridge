import burnSysToSysx from "@contexts/Transfer/functions/burnSysToSysx";
import { ITransfer } from "@contexts/Transfer/types";
import { useMutation } from "react-query";
import { useSyscoin } from "../context/Syscoin";
import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import { readPendingNativeConversion, recordNativeConversion } from "../pending-native-conversion";
import { verifyTransferSigningIntent } from "../transfer-signing-intent";

const pendingSignatures = new Set<string>();

export const useBurnSys = (transfer: ITransfer) => {
  const syscoinInstance = useSyscoin();
  const { sendTransaction } = usePaliWalletV2();
  return useMutation(["burnSys", transfer.id], {
    mutationFn: async () => {
      const pending = readPendingNativeConversion(transfer.id);
      if (pending) return pending;
      if (pendingSignatures.has(transfer.id)) {
        throw new Error("A SYS conversion is already awaiting confirmation in Pali.");
      }
      pendingSignatures.add(transfer.id);
      try {
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
        const broadcast = readPendingNativeConversion(intent.id);
        if (broadcast) return broadcast;
        const { tx, error } = await sendTransaction(psbt);
        if (error) throw new Error(error);
        if (typeof tx !== "string" || !/^[a-f0-9]{64}$/i.test(tx)) {
          throw new Error("Pali Wallet did not return a valid SYS conversion transaction ID.");
        }
        // Record the hash even if the signing component unmounted while Pali
        // was processing the broadcast.
        return recordNativeConversion(intent.id, tx);
      } finally {
        pendingSignatures.delete(transfer.id);
      }
    },
  });
};
