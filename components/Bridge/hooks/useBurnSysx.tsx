import { ITransfer } from "@contexts/Transfer/types";
import { useMutation } from "react-query";
import { useSyscoin } from "../context/Syscoin";
import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import burnSysx from "@contexts/Transfer/functions/burnSysx";
import { SYSX_ASSET_GUID } from "@contexts/Transfer/constants";
import { useFeatureFlags } from "./useFeatureFlags";
import { requestSponsoredUtxo } from "./sponsored-utxo";

export const useBurnSysx = (transfer: ITransfer, toNevm = true) => {
  const syscoinInstance = useSyscoin();
  const {
    sendTransaction,
    signTransaction,
    supportsPartialUtxoSigning,
  } = usePaliWalletV2();
  const { isEnabled } = useFeatureFlags();
  return useMutation(["burnSyx", transfer.id], {
    mutationFn: async () => {
      if (!transfer.utxoXpub || !transfer.utxoAddress) {
        throw new Error("Missing UTXO information");
      }

      if (!transfer.nevmAddress) {
        throw new Error("Missing NEVM address");
      }

      if (
        isEnabled("foundationFundingAvailable") &&
        supportsPartialUtxoSigning
      ) {
        const prepared = await requestSponsoredUtxo(
          transfer.id,
          "prepare-burn"
        );
        if (prepared.sponsored) {
          if (prepared.txid) {
            return prepared.txid;
          }
          if (!prepared.psbt) {
            throw new Error("Sponsored burn is already in progress");
          }

          const signed = await signTransaction(prepared.psbt);
          const submitted = await requestSponsoredUtxo(
            transfer.id,
            "submit-burn",
            signed
          );
          if (!submitted.sponsored) {
            throw new Error(submitted.reason);
          }
          if (!submitted.txid) {
            throw new Error("Sponsored burn is already in progress");
          }
          return submitted.txid;
        }
      }

      const psbt = await burnSysx(
        syscoinInstance,
        transfer.amount,
        SYSX_ASSET_GUID,
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
