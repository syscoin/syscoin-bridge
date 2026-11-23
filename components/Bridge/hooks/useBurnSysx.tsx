import { ITransfer } from "@contexts/Transfer/types";
import { useMutation } from "react-query";
import { useSyscoin } from "../context/Syscoin";
import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import burnSysx from "@contexts/Transfer/functions/burnSysx";
import { SYSX_ASSET_GUID } from "@contexts/Transfer/constants";
import { useFeatureFlags } from "./useFeatureFlags";
import { requestSponsoredUtxo } from "./sponsored-utxo";
import { verifyTransferSigningIntent } from "../transfer-signing-intent";

export const useBurnSysx = (transfer: ITransfer) => {
  const syscoinInstance = useSyscoin();
  const {
    sendTransaction,
    signTransaction,
    supportsPartialUtxoSigning,
  } = usePaliWalletV2();
  const { isEnabled } = useFeatureFlags();
  return useMutation(["burnSyx", transfer.id], {
    mutationFn: async () => {
      const intent = await verifyTransferSigningIntent(transfer);
      if (!intent.utxoXpub) {
        throw new Error("UTXO account information is missing");
      }

      if (
        isEnabled("foundationFundingAvailable") &&
        supportsPartialUtxoSigning
      ) {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const prepared = await requestSponsoredUtxo(
            transfer.id,
            "prepare-burn"
          );
          if (!prepared.sponsored) {
            break;
          }
          if (prepared.txid) {
            return prepared.txid;
          }
          if (!prepared.psbt) {
            throw new Error("A sponsored SYSX burn is already in progress");
          }

          await verifyTransferSigningIntent(intent);
          const signed = await signTransaction(prepared.psbt);
          const submitted = await requestSponsoredUtxo(
            transfer.id,
            "submit-burn",
            signed
          );
          if (!submitted.sponsored) {
            continue;
          }
          if (!submitted.txid) {
            throw new Error("A sponsored SYSX burn is already in progress");
          }
          return submitted.txid;
        }
      }

      const psbt = await burnSysx(
        syscoinInstance,
        intent.amount,
        SYSX_ASSET_GUID,
        intent.utxoAddress,
        intent.utxoXpub,
        intent.type === "sys-to-nevm"
          ? intent.nevmAddress.replace(/^0x/i, "")
          : ""
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
