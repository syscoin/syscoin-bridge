import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type { NextApiRequest, NextApiResponse } from "next";
import handler from "pages/api/flags";

const request = { method: "GET", headers: {}, socket: {} } as NextApiRequest;
const response = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as NextApiResponse & typeof res;
};

const originalEnvironment = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("bridge proof sponsorship policy", () => {
  it.each([
    ["true", "0.50000001", "50000001"],
    ["true", "invalid", null],
    ["true", "", null],
    ["false", "0.50000001", null],
  ])("returns the effective proof minimum when sponsorship is %s with policy %s", (enabled, configured, minimum) => {
    process.env.FOUNDATION_FUNDED = enabled;
    process.env.MINIMUM_AMOUNT = configured;
    const res = response();

    handler(request, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      foundationFundingAvailable: enabled === "true",
      proofSponsorshipMinimumBaseUnits: minimum,
    }));
  });
});
