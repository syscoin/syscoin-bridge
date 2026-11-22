import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ecsign, hashPersonalMessage, privateToAddress, toRpcSig } from "ethereumjs-util";

const mockInit = jest.fn<any>();
const mockCreate = jest.fn<any>();
jest.mock("models/admin-authorization-use", () => ({
  __esModule: true,
  default: { init: mockInit, create: mockCreate },
}));

import { consumeAdminAuthorization, issueAdminAuthorization } from "./admin-authorization";

const testKey = Buffer.alloc(32, 1);
const scope = {
  operation: "add-log" as const,
  address: `0x${privateToAddress(testKey).toString("hex")}`,
  origin: "https://bridge.example",
  sessionId: "test-admin-session",
  transferId: "example-transfer",
  payload: { operation: "burn-sys", clearAll: false, txId: "a".repeat(64) },
};
const sign = (message: string) => {
  const { v, r, s } = ecsign(hashPersonalMessage(Buffer.from(message)), testKey);
  return toRpcSig(v, r, s);
};
const originalSecret = process.env.SECRET_COOKIE_PASSWORD;

describe("administrator wallet authorization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    process.env.SECRET_COOKIE_PASSWORD = "test-admin-cookie-secret-for-unit-tests";
    mockInit.mockResolvedValue(undefined);
    const consumed = new Set<string>();
    mockCreate.mockImplementation(async ({ _id }: { _id: string }) => {
      if (consumed.has(_id)) throw Object.assign(new Error("duplicate"), { code: 11000 });
      consumed.add(_id);
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    if (originalSecret === undefined) delete process.env.SECRET_COOKIE_PASSWORD;
    else process.env.SECRET_COOKIE_PASSWORD = originalSecret;
  });

  it("accepts a signed authorization at most once across concurrent requests", async () => {
    const { challenge, message } = issueAdminAuthorization(scope);
    const signature = sign(message);
    const authorizations = await Promise.all([
      consumeAdminAuthorization(scope, challenge, signature),
      consumeAdminAuthorization(scope, challenge, signature),
    ]);
    expect(authorizations.filter(Boolean)).toHaveLength(1);
  });

  it.each([
    { transferId: "another-transfer" },
    { operation: "override" as const },
    { sessionId: "another-admin-session" },
    { origin: "https://another.example" },
    { payload: { ...scope.payload, clearAll: true } },
  ])("checks the entire authorization scope %#", async (changed) => {
    const { challenge, message } = issueAdminAuthorization(scope);
    const signature = sign(message);
    expect(await consumeAdminAuthorization({ ...scope, ...changed }, challenge, signature)).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects an expired authorization before writing", async () => {
    const { challenge, message } = issueAdminAuthorization(scope);
    jest.advanceTimersByTime(5 * 60 * 1000);
    expect(await consumeAdminAuthorization(scope, challenge, sign(message))).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
