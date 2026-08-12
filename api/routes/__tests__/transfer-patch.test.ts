import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockUpsertTransfer = jest.fn<any>();
const mockGetTransfer = jest.fn<any>();

jest.mock("api/services/transfer", () => {
  class TransferNotFoundError extends Error {
    constructor() {
      super("Transfer not found");
      this.name = "TransferNotFoundError";
      Object.setPrototypeOf(this, TransferNotFoundError.prototype);
    }
  }

  return {
    TransferNotFoundError,
    TransferService: jest.fn().mockImplementation(() => ({
      getTransfer: mockGetTransfer,
      upsertTransfer: mockUpsertTransfer,
    })),
  };
});
jest.mock("lib/mongodb", () => jest.fn());
jest.mock("utils/api/cors", () => ({
  applyApiCors: jest.fn(() => false),
}));

import { NextApiRequest, NextApiResponse } from "next";
import { TransferNotFoundError } from "api/services/transfer";
import { getRequest, patchRequest } from "pages/api/transfer/[id]";

const createResponse = () => {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
  };
  response.status.mockReturnValue(response);
  return response as unknown as NextApiResponse & typeof response;
};

describe("transfer PATCH binding", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpsertTransfer.mockResolvedValue({});
  });

  it("rejects a body that targets a different transfer than the URL", async () => {
    const request = {
      query: { id: "victim-transfer" },
      body: { id: "attacker-transfer" },
      headers: {},
    } as unknown as NextApiRequest;
    const response = createResponse();

    await patchRequest(request, response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(mockUpsertTransfer).not.toHaveBeenCalled();
  });
});

describe("transfer GET errors", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 404 when the transfer does not exist", async () => {
    mockGetTransfer.mockRejectedValue(new TransferNotFoundError());
    const request = {
      query: { id: "missing-transfer" },
    } as unknown as NextApiRequest;
    const response = createResponse();

    await getRequest(request, response);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      message: "Transfer not found",
    });
  });

  it("does not mask unexpected server errors", async () => {
    const error = new Error("Database unavailable");
    mockGetTransfer.mockRejectedValue(error);
    const request = {
      query: { id: "existing-transfer" },
    } as unknown as NextApiRequest;

    await expect(getRequest(request, createResponse())).rejects.toBe(error);
  });
});
