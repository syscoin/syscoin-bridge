import { beforeEach, describe, expect, it, jest } from "@jest/globals";
const recover = jest.fn<any>(), connect = jest.fn<any>();
jest.mock("lib/mongodb", () => ({ __esModule: true, default: connect }));
jest.mock("../transfer", () => {
  const actual = jest.requireActual<any>("../transfer");
  return { ...actual, TransferService: jest.fn().mockImplementation(() => ({ recoverFreezeBurn: recover })) };
});
jest.mock("utils/api/cors", () => ({ applyApiCors: () => false }));
import handler from "../../../pages/api/transfer/[id]/recover-freeze-burn";
import { TransferWriteUnauthorizedError, TransferWriteConflictError } from "../transfer";
import { TransferValidationError } from "../transfer-validation";
const hash = `0x${"a".repeat(64)}`;
const response = () => {
  const res = { status: jest.fn<any>(), json: jest.fn<any>() };
  res.status.mockReturnValue(res); return res;
};
beforeEach(() => { jest.clearAllMocks(); });
describe("hash-only recovery API", () => {
  it("passes only the URL id, hash and existing capability", async () => {
    const req: any = { method: "POST", query: { id: "transfer-1" }, body: { txHash: hash }, headers: { authorization: "Bearer scoped-token" } };
    const res = response(); recover.mockResolvedValue({ id: "transfer-1" });
    await handler(req, res as any);
    expect(recover).toHaveBeenCalledWith("transfer-1", hash, ["scoped-token"]);
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it.each([{ txHash: hash, rpcUrl: "https://attacker.invalid" }, { txHash: hash, receipt: {} }, { txHash: hash, clearAll: true }, { txHash: [] }])("rejects extra or nonscalar input before DB/service", async (body) => {
    const res = response(); await handler({ method: "POST", query: { id: "transfer-1" }, body } as any, res as any);
    expect(res.status).toHaveBeenCalledWith(400); expect(connect).not.toHaveBeenCalled(); expect(recover).not.toHaveBeenCalled();
  });
  it.each(["GET", "PUT", "PATCH"])("rejects %s", async (method) => {
    const res = response(); await handler({ method } as any, res as any);
    expect(res.status).toHaveBeenCalledWith(405); expect(recover).not.toHaveBeenCalled();
  });
  it.each([[new TransferWriteUnauthorizedError(), 401], [new TransferWriteConflictError(), 409], [new TransferValidationError("Pending"), 400]] as [Error, number][])("preserves typed refusal status", async (error, status) => {
    const res = response(); recover.mockRejectedValue(error);
    await handler({ method: "POST", query: { id: "transfer-1" }, body: { txHash: hash }, headers: {} } as any, res as any);
    expect(res.status).toHaveBeenCalledWith(status);
  });
});
