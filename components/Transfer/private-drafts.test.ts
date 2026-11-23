import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type { ITransfer } from "@contexts/Transfer/types";
import { getTransferSourceAsset } from "utils/transfer-progress";
import { getTransferWriteToken } from "utils/transfer-write-token";
import { DRAFTS_PER_PAGE, readPrivateDrafts } from "./private-drafts";

jest.mock("utils/transfer-write-token");
const getToken = jest.mocked(getTransferWriteToken);
const draft = (id: string, historyPublic: boolean) => ({
  id,
  historyPublic,
  utxoAddress: "utxo-address",
  nevmAddress: "nevm-address",
  status: "burn-sys",
  amount: "1",
  createdAt: 1,
});

const json = (data: unknown) => new Response(JSON.stringify(data));

describe("private transfer drafts", () => {
  afterEach(() => {
    getToken.mockReset();
    jest.restoreAllMocks();
  });

  it("loads only private drafts matched to local transfer credentials", async () => {
    getToken.mockImplementation((id) => id === "no-token" ? undefined : `capability-${id}`);
    const fetchMock = jest.spyOn(global, "fetch")
      .mockResolvedValueOnce(json(draft("mine", false)))
      .mockResolvedValueOnce(json(draft("public", true)))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(json(draft("different-id", false)));

    await expect(readPrivateDrafts(["mine", "public", "denied", "wrong-id", "no-token"]))
      .resolves.toEqual({ drafts: [draft("mine", false)], hasError: true });
    expect(fetchMock.mock.calls.map(([url, options]) => [url, options?.headers])).toEqual([
      ["/api/transfer/mine", { Authorization: "Bearer capability-mine" }],
      ["/api/transfer/public", { Authorization: "Bearer capability-public" }],
      ["/api/transfer/denied", { Authorization: "Bearer capability-denied" }],
      ["/api/transfer/wrong-id", { Authorization: "Bearer capability-wrong-id" }],
    ]);
    expect(fetchMock).toHaveBeenCalledWith("/api/transfer/mine", expect.objectContaining({
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
    }));
  });

  it.each<[Pick<ITransfer, "type" | "utxoAssetType" | "useSysx">, string]>([
    [{ type: "sys-to-nevm", utxoAssetType: "sysx" }, "SYSX"],
    [{ type: "sys-to-nevm", useSysx: true }, "SYSX"],
    [{ type: "sys-to-nevm", utxoAssetType: "sys" }, "SYS"],
    [{ type: "nevm-to-sys", utxoAssetType: "sysx" }, "SYS"],
  ])("displays the source asset for %j", (transfer, expected) => {
    expect(getTransferSourceAsset(transfer)).toBe(expected);
  });

  it("checks only one page and bounds concurrent requests", async () => {
    getToken.mockReturnValue("capability");
    let pending = 0;
    let peak = 0;
    const fetchMock = jest.spyOn(global, "fetch").mockImplementation(async () => {
      pending += 1;
      peak = Math.max(peak, pending);
      await Promise.resolve();
      pending -= 1;
      return new Response(null, { status: 404 });
    });
    const ids = Array.from({ length: DRAFTS_PER_PAGE + 3 }, (_, index) => `transfer-${index}`);

    await expect(readPrivateDrafts(ids)).resolves.toEqual({ drafts: [], hasError: false });
    expect(fetchMock).toHaveBeenCalledTimes(DRAFTS_PER_PAGE);
    expect(peak).toBeLessThanOrEqual(4);
  });
});
