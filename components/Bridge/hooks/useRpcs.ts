import { useQuery } from "react-query";
import { buildApiUrl } from "utils/api-base-url";

type RpcApiResponse = {
  nevmRpc: string;
};

export const useRpc = () => {
  return useQuery<RpcApiResponse>(["rpc"], () => {
    return fetch(buildApiUrl("/api/rpc")).then(
      (res) => res.json() as Promise<RpcApiResponse>
    );
  });
};
