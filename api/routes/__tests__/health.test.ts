import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockDbConnect = jest.fn<any>();

jest.mock("lib/mongodb", () => mockDbConnect);

import { NextApiRequest, NextApiResponse } from "next";
import { healthRequest } from "pages/api/health";

const createResponse = () => {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
  };
  response.status.mockReturnValue(response);
  return response as unknown as NextApiResponse & typeof response;
};

describe("backend health", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reports healthy only after database initialization succeeds", async () => {
    mockDbConnect.mockResolvedValue({});
    const response = createResponse();

    await healthRequest({} as NextApiRequest, response);

    expect(mockDbConnect).toHaveBeenCalledTimes(1);
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({ message: "ok" });
  });

  it("fails readiness when database initialization fails", async () => {
    const error = new Error("database unavailable");
    mockDbConnect.mockRejectedValue(error);
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const response = createResponse();

    await healthRequest({} as NextApiRequest, response);

    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith({ message: "unhealthy" });
    expect(consoleError).toHaveBeenCalledWith(
      "Database health check failed",
      error
    );
    consoleError.mockRestore();
  });
});
