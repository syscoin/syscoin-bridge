import { useQuery } from "react-query";

type FeatureFlags = {
  foundationFundingAvailable: boolean;
  adminEnabled: boolean;
  chainId: string;
};

export const useFeatureFlags = () => {
  const flags = useQuery<unknown, unknown, FeatureFlags>("featureFlags", () => {
    return fetch("/api/flags").then((res) => res.json());
  });

  return {
    isEnabled: (flag: keyof FeatureFlags) =>
      (flags.isFetched && flags.data?.[flag]) ?? false,
    chainId: flags.data?.chainId ? parseInt(flags.data.chainId) : 57,
  };
};
