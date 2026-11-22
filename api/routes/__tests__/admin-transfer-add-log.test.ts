import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { NextApiRequest, NextApiResponse } from "next";

const mockAuthorize = jest.fn<any>();
const mockBurnSys = jest.fn<any>();

jest.mock("utils/api/admin-session-guard", () => ({
  __esModule: true,
  default: (handler: unknown) => handler,
}));
jest.mock("utils/api/admin-authorization", () => ({
  authorizeAdminTransferAction: mockAuthorize,
  isAdminTransferId: (id: unknown) => typeof id === "string",
}));
jest.mock("api/services/admin-transfer/handle-burn-sys", () => ({ handleBurnSys: mockBurnSys }));
jest.mock("api/services/admin-transfer/handle-burn-sysx", () => ({ handleBurnSysx: jest.fn() }));
jest.mock("api/services/admin-transfer/handle-submit-proofs", () => ({ handleSubmitProofs: jest.fn() }));
jest.mock("api/services/admin-transfer/handle-freeze-burn", () => ({ handleFreezeBurn: jest.fn() }));
jest.mock("api/services/admin-transfer/handle-mint-sysx", () => ({ handleMintSysx: jest.fn() }));

import handler from "pages/api/admin/transfer/[id]/add-log";

const payload = { operation: "burn-sys", txId: "a".repeat(64), clearAll: true };
const request = {
  method: "POST",
  query: { id: "selected-transfer" },
  body: { ...payload, challenge: "issued-challenge", signedMessage: "signature" },
} as unknown as NextApiRequest;
const response = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as NextApiResponse;
};

describe("signed administrator log updates", () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it("does not dispatch when authorization has not been consumed", async () => {
    mockAuthorize.mockResolvedValue(false);
    await handler(request, response());
    expect(mockBurnSys).not.toHaveBeenCalled();
  });

  it("authorizes and dispatches the same transfer ID and exact operation data", async () => {
    mockAuthorize.mockResolvedValue(true);
    const res = response();
    await handler(request, res);
    expect(mockAuthorize).toHaveBeenCalledWith(request, res, "add-log", "selected-transfer", payload);
    expect(mockBurnSys).toHaveBeenCalledWith("selected-transfer", payload, res);
  });
});
