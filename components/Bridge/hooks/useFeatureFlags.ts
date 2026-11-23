import { useQuery } from "react-query";
import { buildApiUrl } from "utils/api-base-url";
import { toSyscoinBaseUnits } from "utils/syscoin-amount";

type FeatureFlags = {
  foundationFundingAvailable: boolean;
  adminEnabled: boolean;
  isSys5Enabled: boolean;
  isPaliV2NevmEnabled: boolean;
};

type FeaturePolicy = FeatureFlags & {
  proofSponsorshipMinimumBaseUnits?: string | null;
};

export const useFeatureFlags = () => {
  const flags = useQuery<unknown, unknown, FeaturePolicy>(
    "featureFlags",
    () => {
      return fetch(buildApiUrl("/api/flags")).then((res) => res.json());
    }
  );

  return {
    isEnabled: (flag: keyof FeatureFlags) =>
      (flags.isFetched && flags.data?.[flag]) ?? false,
    canSponsorProof: (amount: string) => {
      const minimum = flags.data?.proofSponsorshipMinimumBaseUnits;
      if (!flags.data?.foundationFundingAvailable || !minimum) return false;
      try {
        return BigInt(toSyscoinBaseUnits(amount)) >= BigInt(minimum);
      } catch {
        return false;
      }
    },
  };
};
