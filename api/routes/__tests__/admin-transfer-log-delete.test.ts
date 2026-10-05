import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { NextApiRequest, NextApiResponse } from "next";

const mockUpdateMany = jest.fn<any>();
jest.mock("models/transfer", () => ({ __esModule: true, default: { updateMany: mockUpdateMany } }));
jest.mock("lib/mongodb", () => jest.fn());
jest.mock("utils/api/admin-session-guard", () => ({ __esModule: true, default: (handler: unknown) => handler }));

import adminTransferLogHandler from "pages/api/admin/transfer/[id]/log/[date]";

const response = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as NextApiResponse & typeof res;
};

describe("administrator log deletion versioning", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ modifiedCount: 1 });
  });

  it("invalidates stale public snapshots when an administrator removes a log", async () => {
    const req = { method: "DELETE", query: { id: "transfer-id", date: "123" } } as unknown as NextApiRequest;
    const res = response();
    await adminTransferLogHandler(req, res);
    expect(mockUpdateMany).toHaveBeenCalledWith({ id: "transfer-id" }, {
      $inc: { __v: 1 }, $pull: { logs: { date: "123" } },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("does not modify records for unsupported methods", async () => {
    const res = response();
    await adminTransferLogHandler({ method: "POST", query: {} } as unknown as NextApiRequest, res);
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(405);
  });
});
