import { useConstants } from "@contexts/useConstants";
import { UseQueryOptions, useQuery } from "react-query";
import { utils as syscoinUtils } from "syscoinjs-lib";

export const useProof = (
  txId: string | undefined,
  options: Partial<UseQueryOptions>
) => {
  const { constants } = useConstants();
  return useQuery(
    ["proofs", txId],
    async () => {
      const { result } = await syscoinUtils.fetchBackendSPVProof(
        constants!.rpc.utxo,
        txId!
      );
      return result;
    },
    {
      onSuccess: options.onSuccess,
      enabled: Boolean(txId) && Boolean(constants),
    }
  );
};
