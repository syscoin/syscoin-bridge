import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockFindOne = jest.fn<any>();
const mockAuthorize = jest.fn<any>();
jest.mock("models/transfer", () => ({ __esModule: true, default: { findOne: mockFindOne } }));
jest.mock("lib/mongodb", () => jest.fn());
jest.mock("utils/api/admin-session-guard", () => ({ __esModule: true, default: (handler: unknown) => handler }));
jest.mock("utils/api/admin-authorization", () => ({ authorizeAdminTransferAction: mockAuthorize, isAdminTransferId: (id: unknown) => typeof id === "string" }));

import { NextApiRequest, NextApiResponse } from "next";
import adminTransferHandler from "pages/api/admin/transfer/[id]";
import mongoose from "mongoose";

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
  type: "sys-to-nevm", status: "error", amount: "1", set: jest.fn(), increment: jest.fn(),
  save: jest.fn<any>().mockResolvedValue({ id: "transfer-id" }),
});

describe("signed administrator transfer overrides", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthorize.mockResolvedValue(true);
  });

  it("resets the private progress checkpoint only after a signed status override", async () => {
    const transfer = document();
    mockFindOne.mockResolvedValue(transfer);
    const res = response();
    await adminTransferHandler(request(), res);
    expect(mockAuthorize).toHaveBeenCalledWith(
      expect.anything(), res, "override", "transfer-id",
      { changes: [{ property: "status", from: "error", to: "burn-sysx" }] }
    );
    expect(transfer.status).toBe("burn-sysx");
    expect(transfer.set).toHaveBeenCalledWith("progressStatus", undefined);
    expect(transfer.increment).toHaveBeenCalledTimes(1);
    expect(transfer.save).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("does not reset the checkpoint when the signature is invalid", async () => {
    const transfer = document();
    mockFindOne.mockResolvedValue(transfer);
    mockAuthorize.mockImplementation(async (_req: NextApiRequest, res: NextApiResponse) => {
      res.status(401).json({ message: "Invalid authorization" });
      return false;
    });
    const res = response();
    await adminTransferHandler(request(), res);
    expect(mockFindOne).not.toHaveBeenCalled();
    expect(transfer.set).not.toHaveBeenCalled();
    expect(transfer.increment).not.toHaveBeenCalled();
    expect(transfer.save).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it.each(["amount", "nevmAddress", "utxoAddress", "id", "type", "utxoXpub"])(
    "keeps transfer intent field %s immutable",
    async (property) => {
      const transfer = document();
      mockFindOne.mockResolvedValue(transfer);
      const res = response();
      await adminTransferHandler(request([{ property, from: "1", to: "2" }]), res);
      expect(mockAuthorize).not.toHaveBeenCalled();
      expect(transfer.save).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    }
  );

  it("returns a conflict without resetting progress for a stale status override", async () => {
    const transfer = document();
    mockFindOne.mockResolvedValue(transfer);
    const res = response();
    await adminTransferHandler(
      request([{ property: "status", from: "completed", to: "burn-sysx" }]),
      res
    );
    expect(transfer.status).toBe("error");
    expect(transfer.set).not.toHaveBeenCalled();
    expect(transfer.increment).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("returns a conflict if another writer advances the version first", async () => {
    const transfer = document();
    mockFindOne.mockResolvedValue(transfer);
    transfer.save.mockRejectedValueOnce(new mongoose.Error.VersionError(
      { _doc: { _id: "transfer-id" } } as any, 3, ["status"]
    ));
    const res = response();
    await adminTransferHandler(request(), res);
    expect(transfer.increment).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: "Transfer changed while saving; refresh before retrying",
    });
  });
});
