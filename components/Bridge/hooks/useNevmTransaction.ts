import { useQuery } from "react-query";
import { useWeb3 } from "../context/Web";

type Options = {
  refetch?: boolean;
};

export const useNevmTransaction = (
  transactionHash?: string,
  options: Options = {}
) => {
  const web3 = useWeb3();
  return useQuery(["nevm", "transaction", transactionHash], {
    queryFn: async () => {
      const receipt = await web3.eth.getTransactionReceipt(transactionHash!);

      if (receipt.status === true) {
        return receipt;
      }
      throw new Error("Transaction not confirmed");
    },
    refetchInterval: options.refetch ? 1000 : undefined,
    refetchOnMount: options.refetch,
    refetchOnReconnect: options.refetch,
    refetchOnWindowFocus: options.refetch,
    refetchIntervalInBackground: options.refetch,
    retry: true,
    enabled: Boolean(transactionHash),
  });
};
