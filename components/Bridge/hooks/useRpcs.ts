import { useQuery } from "react-query";
import { API_BASE_URL } from "utils/api-base-url";

type RpcApiResponse = {
  nevmRpc: string;
};

export const useRpc = () => {
  return useQuery<RpcApiResponse>(["rpc"], () => {
    return fetch(`${API_BASE_URL}/api/rpc`).then(
      (res) => res.json() as Promise<RpcApiResponse>
    );
  });
};
