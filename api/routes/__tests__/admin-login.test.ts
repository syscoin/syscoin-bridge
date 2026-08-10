import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockDbConnect = jest.fn<any>();
const mockFindOne = jest.fn<any>();
const mockVerifySignature = jest.fn<any>();

jest.mock("lib/mongodb", () => mockDbConnect);
jest.mock("models/admin", () => ({
  __esModule: true,
  default: { findOne: mockFindOne },
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

const createResponse = () => {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
  };
  response.status.mockReturnValue(response);
  return response as unknown as NextApiResponse & typeof response;
};

const createRequest = () => {
  const save = jest.fn<any>().mockResolvedValue(undefined);
  const request = {
    method: "POST",
    body: { address: checksumAddress, signedMessage: "0xsigned" },
    headers: {},
    session: { save },
  } as unknown as NextApiRequest;
  return { request, save };
};

describe("admin login", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDbConnect.mockResolvedValue(undefined);
    mockVerifySignature.mockReturnValue(true);
  });

  it("normalizes a checksum-cased wallet before finding the admin", async () => {
    mockFindOne.mockResolvedValue({
      address: normalizedAddress,
      name: "function0x",
    });
    const { request, save } = createRequest();
    const response = createResponse();

    await adminLoginRequest(request, response);

    expect(mockVerifySignature).toHaveBeenCalledWith(
      "Login to Syscoin Bridge Admin",
      "0xsigned",
      normalizedAddress
    );
    expect(mockFindOne).toHaveBeenCalledWith({ address: normalizedAddress });
    expect(request.session.user).toEqual({
      address: normalizedAddress,
      name: "function0x",
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(response.status).toHaveBeenCalledWith(200);
  });

  it("returns an explicit error for an unregistered wallet", async () => {
    mockFindOne.mockResolvedValue(null);
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

  it("rejects malformed signatures without throwing", async () => {
    mockVerifySignature.mockImplementation(() => {
      throw new Error("bad signature encoding");
    });
    const { request } = createRequest();
    const response = createResponse();

    await adminLoginRequest(request, response);

    expect(mockFindOne).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      message: "Wallet signature is invalid",
    });
  });
});
