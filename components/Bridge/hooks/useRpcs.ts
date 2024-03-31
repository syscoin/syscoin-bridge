import { useQuery } from "react-query";

type RpcApiResponse = {
  nevmRpc: string;
};

export const useRpc = () => {
  return useQuery<RpcApiResponse>(["rpc"], () => {
    return fetch("/api/rpc").then(
      (res) => res.json() as Promise<RpcApiResponse>
    );
  });
};
