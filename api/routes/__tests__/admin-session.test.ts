import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { NextApiRequest, NextApiResponse } from "next";

const mockDbConnect = jest.fn<any>().mockResolvedValue(undefined);
const mockGetAdmin = jest.fn<any>();

jest.mock("lib/mongodb", () => mockDbConnect);
jest.mock("api/services/admin", () => ({
  AdminService: jest.fn(() => ({ getAdmin: mockGetAdmin })),
}));
jest.mock("utils/api/cors", () => ({ applyApiCors: jest.fn(() => false) }));
jest.mock("lib/session", () => ({ withSessionRoute: (handler: unknown) => handler }));

import adminSessionGuard from "utils/api/admin-session-guard";
import { adminLogoutRequest } from "pages/api/admin/logout";

const origin = "https://bridge.example";
const makeRequest = (method: string, headers = { origin }) => {
  const destroy = jest.fn();
  const request = {
    method,
    headers,
    session: {
      user: { address: "0x1111111111111111111111111111111111111111", adminId: "enrollment", sessionId: "session" },
      destroy,
    },
  } as unknown as NextApiRequest;
  return { request, destroy };
};
const makeResponse = () => {
  const response = { status: jest.fn(), json: jest.fn(), send: jest.fn(), setHeader: jest.fn() };
  response.status.mockReturnValue(response);
  return response as unknown as NextApiResponse & typeof response;
};

describe("administrator sessions", () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it.each([null, { _id: "new-enrollment" }])(
    "rejects a session from a removed or replaced enrollment",
    async (admin) => {
      mockGetAdmin.mockResolvedValue(admin);
      const handler = jest.fn<any>();
      const { request } = makeRequest("GET");
      const response = makeResponse();
      await adminSessionGuard(handler)(request, response);
      expect(response.status).toHaveBeenCalledWith(401);
      expect(handler).not.toHaveBeenCalled();
    }
  );

  it("lets an active administrator use the existing session", async () => {
    mockGetAdmin.mockResolvedValue({ _id: "enrollment" });
    const handler = jest.fn<any>();
    const { request } = makeRequest("GET");
    const response = makeResponse();
    await adminSessionGuard(handler)(request, response);
    expect(handler).toHaveBeenCalledWith(request, response);
  });

  it("rejects navigation requests without destroying the session", async () => {
    const { request, destroy } = makeRequest("GET");
    const response = makeResponse();
    await adminLogoutRequest(request, response);
    expect(response.status).toHaveBeenCalledWith(405);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("lets the administrator log out by POST", async () => {
    const { request, destroy } = makeRequest("POST");
    const response = makeResponse();
    await adminLogoutRequest(request, response);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(response.send).toHaveBeenCalledWith({ ok: true });
  });
});
