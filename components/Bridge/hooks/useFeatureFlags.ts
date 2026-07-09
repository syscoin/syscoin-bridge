import { useQuery } from "react-query";
import { buildApiUrl } from "utils/api-base-url";

type FeatureFlags = {
  foundationFundingAvailable: boolean;
  adminEnabled: boolean;
  isSys5Enabled: boolean;
  isPaliV2NevmEnabled: boolean;
};

export const useFeatureFlags = () => {
  const flags = useQuery<unknown, unknown, FeatureFlags>(
    "featureFlags",
    () => {
      return fetch(buildApiUrl("/api/flags")).then((res) => res.json());
    }
  );

  return {
    isEnabled: (flag: keyof FeatureFlags) =>
      (flags.isFetched && flags.data?.[flag]) ?? false,
  };
};
