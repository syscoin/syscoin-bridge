import { useQuery } from "react-query";

type Constants = {
  contracts: {
    relayContract: { address: string };
    ecr20ManagerContract: { address: string };
  };
  rpc: {
    nevm: string;
    utxo: string;
  };
  explorer: {
    nevm: string;
    utxo: string;
  };
  isTestnet: boolean;
  chain_id: string;
};

export const useConstants = () => {
  const query = useQuery<Constants>({
    queryKey: "constants",
    queryFn: () => {
      return fetch("/api/constants").then((res) => res.json());
    },
  });

  return { ...query, constants: query.data };
};
