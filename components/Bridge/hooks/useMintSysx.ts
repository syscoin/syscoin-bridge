import { ITransfer } from "@contexts/Transfer/types";
import { useMutation } from "react-query";
import { utils } from "syscoinjs-lib";
import { useSyscoin } from "../context/Syscoin";
import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import { useConstants } from "@contexts/useConstants";

export const useMintSysx = (transfer: ITransfer) => {
  const syscoinInstance = useSyscoin();
  const { constants } = useConstants();
  const { sendTransaction } = usePaliWalletV2();
  return useMutation(
    ["mintSysx", transfer.id],
    async (transactionHash: string) => {
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
        transfer.utxoAddress,
        feeRate,
        transfer.utxoXpub
      );

      if (!res) {
        throw new Error("Mint SYS error: Not enough funds");
      }

      const psbt = utils.exportPsbtToJson(res.psbt, res.assets);
      const { tx, error } = await sendTransaction(psbt);

      if (error) {
        throw new Error(error);
      }
      return tx;
    }
  );
};
