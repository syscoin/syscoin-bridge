import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockFindOne = jest.fn<any>();
const mockVerifySignature = jest.fn<any>();
jest.mock("models/transfer", () => ({ __esModule: true, default: { findOne: mockFindOne } }));
jest.mock("lib/mongodb", () => jest.fn());
jest.mock("utils/api/admin-session-guard", () => ({ __esModule: true, default: (handler: unknown) => handler }));
jest.mock("utils/api/verify-signature", () => ({ verifySignature: mockVerifySignature }));

import { NextApiRequest, NextApiResponse } from "next";
import adminTransferHandler from "pages/api/admin/transfer/[id]";

const request = (changes = [{ property: "status", from: "error", to: "burn-sysx" }]) => ({
  method: "POST", query: { id: "transfer-id" },
  session: { user: { address: "0x1111111111111111111111111111111111111111" } },
  body: { changes, signedMessage: "admin-signature" },
} as unknown as NextApiRequest);
const response = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as NextApiResponse & typeof res;
};
const document = () => ({
  status: "error", amount: "1", set: jest.fn(), save: jest.fn<any>().mockResolvedValue({ id: "transfer-id" }),
});

describe("signed administrator transfer overrides", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifySignature.mockReturnValue(true);
  });

  it("resets the private progress checkpoint only after a signed status override", async () => {
    const transfer = document();
    mockFindOne.mockResolvedValue(transfer);
    const res = response();
    await adminTransferHandler(request(), res);
    expect(transfer.status).toBe("burn-sysx");
    expect(transfer.set).toHaveBeenCalledWith("progressStatus", undefined);
    expect(transfer.save).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("does not reset the checkpoint when the signature is invalid", async () => {
    const transfer = document();
    mockFindOne.mockResolvedValue(transfer);
    mockVerifySignature.mockReturnValue(false);
    const res = response();
    await adminTransferHandler(request(), res);
    expect(mockFindOne).not.toHaveBeenCalled();
    expect(transfer.set).not.toHaveBeenCalled();
    expect(transfer.save).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("does not reset progress for an unrelated edit or a stale status override", async () => {
    const transfer = document();
    mockFindOne.mockResolvedValue(transfer);
    await adminTransferHandler(request([
      { property: "amount", from: "1", to: "2" },
      { property: "status", from: "completed", to: "burn-sysx" },
    ]), response());
    expect(transfer.amount).toBe("2");
    expect(transfer.status).toBe("error");
    expect(transfer.set).not.toHaveBeenCalled();
  });
});
