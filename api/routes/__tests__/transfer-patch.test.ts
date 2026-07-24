import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockUpsertTransfer = jest.fn<any>();

jest.mock("api/services/transfer", () => ({
  TransferService: jest.fn().mockImplementation(() => ({
    getTransfer: jest.fn(),
    upsertTransfer: mockUpsertTransfer,
  })),
}));
jest.mock("lib/mongodb", () => jest.fn());
jest.mock("utils/api/cors", () => ({
  applyApiCors: jest.fn(() => false),
}));

import { NextApiRequest, NextApiResponse } from "next";
import { patchRequest } from "pages/api/transfer/[id]";

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
