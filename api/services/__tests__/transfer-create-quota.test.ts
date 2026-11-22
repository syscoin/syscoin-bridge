import { afterEach, expect, it, jest } from "@jest/globals";
import type { NextApiRequest } from "next";
import TransferCreateQuota from "models/transfer-create-quota";
import { chargeTransferCreation, transferQuotaClient } from "../transfer-create-quota";

afterEach(() => { jest.restoreAllMocks(); });

const updateResult = (matchedCount: number) => ({
  acknowledged: true, matchedCount, modifiedCount: matchedCount,
  upsertedId: null, upsertedCount: 0,
});

it("resolves a concurrent quota bucket creation with a bounded update", async () => {
  const update = jest.spyOn(TransferCreateQuota, "updateOne")
    .mockRejectedValueOnce({ code: 11000 })
    .mockResolvedValueOnce(updateResult(1));
  await expect(chargeTransferCreation("192.0.2.1", 1000)).resolves.toBeUndefined();
  expect(update).toHaveBeenNthCalledWith(1, expect.objectContaining({
    count: { $lt: 120 },
  }), expect.objectContaining({ $inc: { count: 1 } }), { upsert: true });
  expect(update).toHaveBeenNthCalledWith(2, expect.objectContaining({
    count: { $lt: 120 },
  }), expect.objectContaining({ $inc: { count: 1 } }));
});

it("rejects a full bucket with a time to retry", async () => {
  jest.spyOn(TransferCreateQuota, "updateOne").mockRejectedValueOnce({ code: 11000 })
    .mockResolvedValueOnce(updateResult(0));
  await expect(chargeTransferCreation("192.0.2.1", 1000)).rejects.toMatchObject({
    name: "TransferCreateLimitError", retryAfter: 599,
  });
});

it("uses the connection address unless the ingress explicitly trusts its client IP header", () => {
  const req = {
    headers: { "cf-connecting-ip": "198.51.100.2" },
    socket: { remoteAddress: "192.0.2.1" },
  } as unknown as NextApiRequest;
  const old = process.env.TRANSFER_TRUST_CLOUDFLARE;
  try {
    process.env.TRANSFER_TRUST_CLOUDFLARE = "false";
    expect(transferQuotaClient(req, {})).toBe("192.0.2.1");
    process.env.TRANSFER_TRUST_CLOUDFLARE = "true";
    expect(transferQuotaClient(req, {})).toBe("198.51.100.2");
  } finally {
    if (old === undefined) delete process.env.TRANSFER_TRUST_CLOUDFLARE;
    else process.env.TRANSFER_TRUST_CLOUDFLARE = old;
  }
});

it("does not share one quota across all wallets behind a private ingress", () => {
  const req = { headers: {}, socket: { remoteAddress: "::ffff:172.16.0.1" } } as unknown as NextApiRequest;
  expect(transferQuotaClient(req, { nevmAddress: "first" })).not.toBe(
    transferQuotaClient(req, { nevmAddress: "second" })
  );
});
