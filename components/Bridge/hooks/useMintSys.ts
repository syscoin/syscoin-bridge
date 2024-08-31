import { ITransfer } from "@contexts/Transfer/types";
import { useMutation } from "react-query";
import { utils } from "syscoinjs-lib";
import { useSyscoin } from "../context/Syscoin";
import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";

export const useMintSys = (transfer: ITransfer) => {
  const syscoinInstance = useSyscoin();
  const { sendTransaction } = usePaliWalletV2();
  return useMutation(
    ["mintSys", transfer.id],
    async (transactionHash: string) => {
      const feeRate = new utils.BN(10);
      const txOpts = { rbf: true, web3url: "https://rpc.syscoin.org", ethtxid: transactionHash};
      const res = await syscoinInstance.sysMintFromNEVM(
        txOpts,
        transfer.utxoAddress,
        feeRate,
        transfer.utxoXpub
      );

      if (!res) {
        throw new Error("Mint SYS error: Not enough funds");
      }

      const psbt = utils.exportPsbtToJson(res.psbt);
      const { tx, error } = await sendTransaction(psbt);

      if (error) {
        throw new Error(error);
      }
      return tx;
    }
  );
};
