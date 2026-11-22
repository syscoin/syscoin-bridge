import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { NextApiRequest, NextApiResponse } from "next";

const mockUpdateOne = jest.fn<any>();
const mockSelect = jest.fn<any>();
jest.mock("models/transfer", () => ({
  __esModule: true,
  default: { updateOne: mockUpdateOne, findOne: () => ({ select: mockSelect }) },
}));
jest.mock("lib/mongodb", () => jest.fn());
jest.mock("utils/api/admin-session-guard", () => ({ __esModule: true, default: (handler: unknown) => handler }));

import adminTransferLogHandler from "pages/api/admin/transfer/[id]/log/[date]";

const response = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as NextApiResponse & typeof res;
};

const request = {
  method: "DELETE", headers: { origin: "https://bridge.example" }, query: { id: "transfer-id", date: "123" },
} as unknown as NextApiRequest;

const sourceHash = "a".repeat(64);
const sourceLog = { status: "burn-sysx", date: 123, payload: { data: { tx: sourceHash } } };
const record = { _id: "db-id", __v: 7, type: "sys-to-nevm", logs: [sourceLog] };

describe("administrator log deletion versioning", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    mockSelect.mockResolvedValue(record);
  });

  it("invalidates stale public snapshots when an administrator removes a log", async () => {
    const res = response();
    await adminTransferLogHandler(request, res);
    expect(mockUpdateOne).toHaveBeenCalledWith({ _id: "db-id", __v: 7 }, {
      $inc: { __v: 1 }, $pull: { logs: { date: 123 } },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("revokes public history when the source log is deleted", async () => {
    mockSelect.mockResolvedValue({ ...record, historyEvidence: { sourceTransactionHash: sourceHash } });
    await adminTransferLogHandler(request, response());
    expect(mockUpdateOne).toHaveBeenCalledWith({ _id: "db-id", __v: 7 }, {
      $inc: { __v: 1 }, $pull: { logs: { date: 123 } }, $unset: { historyEvidence: 1 },
    });
  });

  it("keeps public history when a matching source log remains", async () => {
    mockSelect.mockResolvedValue({
      ...record,
      logs: [sourceLog, { ...sourceLog, date: 124, payload: { data: { tx: sourceHash.toUpperCase() } } }],
      historyEvidence: { sourceTransactionHash: sourceHash },
    });
    await adminTransferLogHandler(request, response());
    expect(mockUpdateOne).toHaveBeenCalledWith({ _id: "db-id", __v: 7 }, {
      $inc: { __v: 1 }, $pull: { logs: { date: 123 } },
    });
  });

  it("reports a conflict if progress changed after the delete snapshot", async () => {
    mockUpdateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });
    const res = response();
    await adminTransferLogHandler(request, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("requires an origin before deleting logs", async () => {
    const res = response();
    const req = { method: "DELETE", headers: {}, query: { id: "transfer-id", date: "123" } } as unknown as NextApiRequest;
    await adminTransferLogHandler(req, res);
    expect(mockUpdateOne).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("does not modify records for unsupported methods", async () => {
    const res = response();
    await adminTransferLogHandler({ method: "POST", query: {} } as unknown as NextApiRequest, res);
    expect(mockUpdateOne).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(405);
  });
});
