import { ITransfer } from "@contexts/Transfer/types";
import { useWeb3 } from "../context/Web";
import { useMutation } from "react-query";
import { SYSX_ASSET_GUID } from "@contexts/Transfer/constants";
import { toWei } from "web3-utils";
import { useErc20ManagerContract } from "./useErc20ManagerContract";
import { DEFAULT_GAS_LIMIT } from "@constants";
import { useFeatureFlags } from "./useFeatureFlags";

export const useFreezeAndBurn = (transfer: ITransfer) => {
  const erc20ManagerContract = useErc20ManagerContract();
  const web3 = useWeb3();
  const flags = useFeatureFlags();
  return useMutation(["freezeAndBurn", transfer.id], {
    mutationFn: async () => {
      const amount = toWei(transfer.amount.toString(), "ether");

      let method = flags.isEnabled("isSys5Enabled")
        ? erc20ManagerContract.methods.freezeBurn(
            amount,
            "0x0000000000000000000000000000000000000000",
            0,
            transfer.utxoAddress
          )
        : erc20ManagerContract.methods.freezeBurnERC20(
            amount,
            SYSX_ASSET_GUID,
            transfer.utxoAddress
          );

      const gasPrice = await web3.eth.getGasPrice();

      const gas = await method
        .estimateGas({
          value: amount,
        })
        .catch((error: Error) => {
          console.error("Estimate gas error", error);
          return DEFAULT_GAS_LIMIT;
        });

      return new Promise<string>((resolve, reject) => {
        method
          .send({
            from: transfer.nevmAddress,
            gas,
            value: amount,
            gasPrice,
          })
          .once("transactionHash", (hash: string | any) => {
            // Handle both string and object formats
            const txHash = typeof hash === "string" ? hash : hash?.hash;
            
            if (!txHash) {
              reject("Failed to freeze and burn sys. Check browser logs");
              console.error("freeze and burn failed", hash);
            } else {
              resolve(txHash);
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
  });
};
