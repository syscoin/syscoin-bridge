import { beforeEach, describe, expect, it, jest } from "@jest/globals";
const mockGetToken = jest.fn<any>();
jest.mock("utils/transfer-write-token", () => ({ getTransferWriteToken: mockGetToken }));
import { recoverExistingFreezeBurn } from "./recover-freeze-burn";

const hash = `0x${"a".repeat(64)}`;
const transfer = { id: "transfer-1", type: "nevm-to-sys", status: "mint-sysx", logs: [], amount: "1", nevmAddress: "0x1111111111111111111111111111111111111111", utxoAddress: "address", utxoXpub: "public-account", createdAt: 1, version: "v2" };
const fetchMock = jest.fn<any>();
beforeEach(() => { jest.clearAllMocks(); global.fetch = fetchMock; mockGetToken.mockReturnValue("private-capability"); });
describe("existing freeze client recovery", () => {
  it("only posts the hash to the same-origin capability endpoint, never wallet or RPC methods", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => transfer });
    await expect(recoverExistingFreezeBurn("transfer-1", hash)).resolves.toEqual(transfer);
    expect(fetchMock).toHaveBeenCalledWith("/api/transfer/transfer-1/recover-freeze-burn", {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Authorization: "Bearer private-capability" }, body: JSON.stringify({ txHash: hash }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not manufacture a new capability when the local token is absent", async () => {
    mockGetToken.mockReturnValue(undefined); fetchMock.mockResolvedValue({ ok: false, json: async () => ({ message: "Unauthorized" }) });
    await expect(recoverExistingFreezeBurn("transfer-1", hash)).rejects.toThrow("Unauthorized");
    expect((fetchMock.mock.calls[0][1] as any).headers.Authorization).toBeUndefined();
  });
  it("refuses invalid input before any request", async () => {
    await expect(recoverExistingFreezeBurn("../other", hash)).rejects.toThrow();
    await expect(recoverExistingFreezeBurn("transfer-1", "invalid")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
