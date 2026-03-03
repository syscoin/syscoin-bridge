import { useQuery } from "react-query";
import { API_BASE_URL } from "utils/api-base-url";

type FeatureFlags = {
  foundationFundingAvailable: boolean;
  adminEnabled: boolean;
  isSys5Enabled: boolean;
  isPaliV2NevmEnabled: boolean;
};

export const useFeatureFlags = () => {
  const flags = useQuery<unknown, unknown, FeatureFlags>("featureFlags", () => {
    return fetch(`${API_BASE_URL}/api/flags`).then((res) => res.json());
  });

  return {
    isEnabled: (flag: keyof FeatureFlags) =>
      (flags.isFetched && flags.data?.[flag]) ?? false,
  };
};
