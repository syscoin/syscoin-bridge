import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockDbConnect = jest.fn<any>();
const mockFindOne = jest.fn<any>();
const mockVerifySignature = jest.fn<any>();
const mockCreate = jest.fn<any>();
const mockInit = jest.fn<any>();

jest.mock("lib/mongodb", () => mockDbConnect);
jest.mock("models/admin", () => ({
  __esModule: true,
  default: { findOne: mockFindOne },
}));
jest.mock("models/admin-authorization-use", () => ({
  __esModule: true,
  default: { init: mockInit, create: mockCreate },
}));
jest.mock("utils/api/verify-signature", () => ({
  verifySignature: mockVerifySignature,
}));
jest.mock("utils/api/cors", () => ({
  applyApiCors: jest.fn(() => false),
}));
jest.mock("lib/session", () => ({
  withSessionRoute: (handler: unknown) => handler,
}));

import { NextApiRequest, NextApiResponse } from "next";
import { adminLoginRequest } from "pages/api/admin/login";

const checksumAddress = "0x95E7F1A98F46541787344032550B8DC633CC5867";
const normalizedAddress = checksumAddress.toLowerCase();

const origin = "https://bridge.example";
const admin = { _id: "admin-id", address: normalizedAddress, name: "Example Admin" };
const originalSecret = process.env.SECRET_COOKIE_PASSWORD;

const createResponse = () => {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
    setHeader: jest.fn(),
  };
  response.status.mockReturnValue(response);
  return response as unknown as NextApiResponse & typeof response;
};

const createRequest = (body: Record<string, unknown> = { address: checksumAddress }) => {
  const save = jest.fn<any>().mockResolvedValue(undefined);
  const request = {
    method: "POST",
    body,
    headers: { origin },
    session: { save },
  } as unknown as NextApiRequest;
  return { request, save };
};

const getChallenge = async (): Promise<{ challenge: string; message: string }> => {
  const { request, save } = createRequest();
  const response = createResponse();
  await adminLoginRequest(request, response);
  expect(save).not.toHaveBeenCalled();
  expect(response.status).toHaveBeenCalledWith(200);
  return response.json.mock.calls[0][0] as { challenge: string; message: string };
};

describe("admin login", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SECRET_COOKIE_PASSWORD = "test-admin-cookie-secret-for-unit-tests";
    mockDbConnect.mockResolvedValue(undefined);
    mockVerifySignature.mockReturnValue(true);
    mockFindOne.mockReturnValue({ exec: async () => admin });
    mockInit.mockResolvedValue(undefined);
    mockCreate.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.SECRET_COOKIE_PASSWORD;
    else process.env.SECRET_COOKIE_PASSWORD = originalSecret;
  });

  it("normalizes the address and issues a session after an origin-bound challenge is signed", async () => {
    const { challenge, message } = await getChallenge();
    expect(message).toContain(`Origin: ${origin}`);
    expect(message).toContain(`Wallet: ${normalizedAddress}`);
    const { request, save } = createRequest({
      address: checksumAddress, challenge, signedMessage: "0xsigned",
    });
    const response = createResponse();

    await adminLoginRequest(request, response);

    expect(mockVerifySignature).toHaveBeenCalledWith(message, "0xsigned", normalizedAddress);
    expect(mockFindOne).toHaveBeenCalledWith({ address: normalizedAddress });
    expect(request.session.user).toEqual({
      address: normalizedAddress,
      name: "Example Admin",
      adminId: admin._id,
      sessionId: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(response.status).toHaveBeenCalledWith(200);
  });

  it("returns an explicit error for an unregistered wallet", async () => {
    mockFindOne.mockReturnValue({ exec: async () => null });
    const { request, save } = createRequest();
    const response = createResponse();

    await adminLoginRequest(request, response);

    expect(save).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      message: "This wallet is not registered as an administrator",
    });
  });

  it("rejects malformed signatures without consuming the challenge", async () => {
    const { challenge } = await getChallenge();
    mockVerifySignature.mockImplementation(() => { throw new Error("bad signature encoding"); });
    const { request, save } = createRequest({
      address: checksumAddress, challenge, signedMessage: "0xsigned",
    });
    const response = createResponse();

    await adminLoginRequest(request, response);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
  });

  it("rejects a prior enrollment's authorization after an admin is readmitted", async () => {
    const { challenge } = await getChallenge();
    mockFindOne.mockReturnValue({ exec: async () => ({ ...admin, _id: "new-enrollment" }) });
    const { request, save } = createRequest({
      address: checksumAddress, challenge, signedMessage: "0xsigned",
    });
    const response = createResponse();

    await adminLoginRequest(request, response);

    expect(mockVerifySignature).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
  });
});
