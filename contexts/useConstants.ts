import { useQuery } from "react-query";
import { buildApiUrl } from "utils/api-base-url";
import {
  getSyscoinChainId,
  isSyscoinTestnetHost,
  resolveSyscoinIsTestnet,
} from "utils/network-config";

export type Constants = {
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
  apiUrl: {
    nevm: string;  // Only EVM networks use API URLs
    // No utxo field - UTXO networks don't need separate API URLs
  };
  isTestnet: boolean;
  chain_id: string;
};

export const useConstants = () => {
  const query = useQuery<Constants>({
    queryKey: "constants",
    queryFn: async () => {
      const response = await fetch(buildApiUrl("/api/constants"));
      if (!response.ok) {
        throw new Error("Unable to load bridge network configuration");
      }

      const constants = (await response.json()) as Constants;
      const configuredChainId =
        constants.chain_id || process.env.NEXT_PUBLIC_CHAIN_ID;
      const isTestnet = resolveSyscoinIsTestnet({
        chain_id: configuredChainId,
        isTestnet:
          constants.isTestnet ||
          process.env.NEXT_PUBLIC_IS_TESTNET === "true" ||
          (typeof window !== "undefined" &&
            isSyscoinTestnetHost(window.location.hostname)),
      });
      const chainId =
        configuredChainId || `0x${getSyscoinChainId(isTestnet).toString(16)}`;

      return {
        ...constants,
        chain_id: chainId,
        isTestnet,
      };
    },
  });

  return { ...query, constants: query.data };
};
