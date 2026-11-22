import { ITransfer } from "@contexts/Transfer/types";
import { useMutation } from "react-query";
import { utils } from "syscoinjs-lib";
import { useSyscoin } from "../context/Syscoin";
import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import { useConstants } from "@contexts/useConstants";
import { useFeatureFlags } from "./useFeatureFlags";
import { requestSponsoredUtxo } from "./sponsored-utxo";
import { exportPsbtWithPrevouts } from "utils/psbt-prevouts";
import { verifyTransferSigningIntent } from "../transfer-signing-intent";

export const useMintSysx = (transfer: ITransfer) => {
  const syscoinInstance = useSyscoin();
  const { constants } = useConstants();
  const { isEnabled } = useFeatureFlags();
  const { sendTransaction } = usePaliWalletV2();
  return useMutation(
    ["mintSysx", transfer.id],
    async (transactionHash: string) => {
      const intent = await verifyTransferSigningIntent(transfer);
      if (isEnabled("foundationFundingAvailable")) {
        const sponsored = await requestSponsoredUtxo(transfer.id, "mint");
        if (sponsored.sponsored) {
          if (!sponsored.txid) {
            throw new Error("A sponsored SYSX mint is already in progress");
          }
          return sponsored.txid;
        }
      }

      if (!intent.utxoXpub) {
        throw new Error("UTXO account information is missing");
      }
      const feeRate = new utils.BN(10);
      const txOpts = { rbf: true };
      const assetOpts = {
        web3url: constants?.rpc.nevm ?? "https://rpc.syscoin.org",
        ethtxid: transactionHash,
      };
      const assetMap = null;

      const res = await syscoinInstance.assetAllocationMint(
        assetOpts,
        txOpts,
        assetMap,
        intent.utxoAddress,
        feeRate,
        intent.utxoXpub
      );

      if (!res) {
        throw new Error("Unable to mint SYSX: insufficient SYS for fees");
      }

      const psbt = await exportPsbtWithPrevouts(res.psbt, res.assets);
      await verifyTransferSigningIntent(intent);
      const { tx, error } = await sendTransaction(psbt);

      if (error) {
        throw new Error(error);
      }
      return tx;
    }
  );
};
