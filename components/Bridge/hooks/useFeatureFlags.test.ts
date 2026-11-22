import { describe, expect, it, jest } from "@jest/globals";

let flags: {
  foundationFundingAvailable: boolean;
  proofSponsorshipMinimumBaseUnits?: string | null;
};

jest.mock("react-query", () => ({
  useQuery: () => ({ isFetched: true, data: flags }),
}));

import { useFeatureFlags as featureFlagsHook } from "./useFeatureFlags";

describe("proof sponsorship eligibility", () => {
  it.each([
    ["0.49999999", false],
    ["0.50000000", true],
    ["0.50000001", true],
    ["invalid", false],
  ])("checks %s against the configured minimum in base units", (amount, eligible) => {
    flags = {
      foundationFundingAvailable: true,
      proofSponsorshipMinimumBaseUnits: "50000000",
    };
    expect(featureFlagsHook().canSponsorProof(amount)).toBe(eligible);
  });

  it.each([undefined, null, "invalid"])("uses the self-funded path without a valid policy (%s)", (minimum) => {
    flags = {
      foundationFundingAvailable: true,
      proofSponsorshipMinimumBaseUnits: minimum,
    };
    expect(featureFlagsHook().canSponsorProof("1")).toBe(false);
  });

  it("uses the self-funded path when sponsorship is disabled", () => {
    flags = {
      foundationFundingAvailable: false,
      proofSponsorshipMinimumBaseUnits: "50000000",
    };
    expect(featureFlagsHook().canSponsorProof("1")).toBe(false);
  });
});
