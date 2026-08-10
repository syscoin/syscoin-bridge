import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockCreateAdmin = jest.fn<any>();

jest.mock("api/services/admin", () => ({
  AdminService: jest.fn().mockImplementation(() => ({
    createAdmin: mockCreateAdmin,
    getAdmin: jest.fn(),
  })),
}));
jest.mock("lib/mongodb", () => jest.fn());
jest.mock("utils/api/cors", () => ({
  applyApiCors: jest.fn(() => false),
}));

import { NextApiRequest, NextApiResponse } from "next";
import adminHandler from "pages/api/admin";

const createResponse = () => {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
  };
  response.status.mockReturnValue(response);
  return response as unknown as NextApiResponse & typeof response;
};

const createRequest = (authorization?: string) =>
  ({
    method: "POST",
    headers: authorization ? { authorization } : {},
    body: {
      address: "0x95E7F1A98F46541787344032550B8DC633CC5867",
      name: "function0x",
    },
  } as unknown as NextApiRequest);

describe("admin provisioning route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ADMIN_API_KEY = "provisioning-secret";
    mockCreateAdmin.mockResolvedValue({ address: "0xadmin" });
  });

  it("rejects unauthenticated admin creation", async () => {
    const response = createResponse();

    await adminHandler(createRequest(), response);

    expect(response.status).toHaveBeenCalledWith(401);
    expect(mockCreateAdmin).not.toHaveBeenCalled();
  });

  it("allows admin creation with the configured API key", async () => {
    const response = createResponse();

    await adminHandler(
      createRequest("Bearer provisioning-secret"),
      response
    );

    expect(mockCreateAdmin).toHaveBeenCalledWith(
      "0x95E7F1A98F46541787344032550B8DC633CC5867",
      "function0x"
    );
    expect(response.status).toHaveBeenCalledWith(200);
  });
});
