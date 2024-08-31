import { ITransfer } from "@contexts/Transfer/types";
import { useMutation } from "react-query";
import { useSyscoin } from "../context/Syscoin";
import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import burnSys from "@contexts/Transfer/functions/burnSys";

export const useBurnSys = (transfer: ITransfer, toNevm = true) => {
  const syscoinInstance = useSyscoin();
  const { sendTransaction } = usePaliWalletV2();
  return useMutation(["burnSys", transfer.id], {
    mutationFn: async () => {
      if (!transfer.utxoXpub || !transfer.utxoAddress) {
        throw new Error("Missing UTXO information");
      }

      if (!transfer.nevmAddress) {
        throw new Error("Missing NEVM address");
      }

      const psbt = await burnSys(
        syscoinInstance,
        transfer.amount,
        transfer.utxoAddress,
        transfer.utxoXpub,
        toNevm ? transfer.nevmAddress.replace(/^0x/g, "") : ""
      );

      const { tx, error } = await sendTransaction(psbt);

      if (error) {
        throw new Error(error);
      }
      return tx;
    },
  });
};
