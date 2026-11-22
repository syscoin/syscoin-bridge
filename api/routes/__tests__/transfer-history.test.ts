import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { NextApiRequest, NextApiResponse } from "next";
import { createHash } from "crypto";
import { utils as syscoinUtils } from "syscoinjs-lib";
import TransferModel from "models/transfer";
import handler from "pages/api/transfer";

jest.mock("lib/mongodb", () => jest.fn());
jest.mock("utils/api/cors", () => ({ applyApiCors: jest.fn(() => false) }));

const nevm = `0x${"11".repeat(16)}aabbccdd`;
const utxo = "sys1qtrgef9gy95ree902dkltyt4vcku8sg8ank49zp";
const accountHash = (xpub: string) => createHash("sha256").update(xpub).digest("hex");
const account = syscoinUtils.bitcoinjs.bip32.fromSeed(Buffer.alloc(32, 5))
  .neutered().toBase58();
const response = () => {
  const res = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as NextApiResponse & typeof res;
};

const request = (method: string, lookup: object) =>
  ({ method, body: lookup, query: lookup, headers: {} }) as unknown as NextApiRequest;

describe("transfer history", () => {
  beforeEach(() => { jest.restoreAllMocks(); });

  it("returns a bounded summary without xpub, diagnostic data or hidden fields", async () => {
    const fetched = jest.spyOn(TransferModel.collection, "find").mockImplementation(
      (() => ({ toArray: async () => Array.from({ length: 51 }, (_, i) => ({
        id: String(i), type: "nevm-to-sys", utxoXpub: account,
        status: "error", progressStatus: "mint-sysx",
        writeTokenHash: "hidden", logs: [{ payload: { data: { error: account } } }],
        historyEvidence: { nevmAddress: nevm, utxoAddresses: [utxo],
          sourceTransactionHash: `0x${"b".repeat(64)}`, utxoAccountHash: accountHash(account) },
      })) })) as any
    );
    const res = response();
    await handler(request("POST", { nevm: `0x${nevm.slice(2).toUpperCase()}`, utxoXpub: account, page: 2, version: "v2" }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(res.setHeader).toHaveBeenCalledWith("X-Bridge-Has-More", "1");
    expect(fetched).toHaveBeenCalledWith(
      { $or: [{ "historyEvidence.nevmAddress": nevm },
        { "historyEvidence.utxoAccountHash": accountHash(account) }], version: "v2" },
      expect.objectContaining({
        limit: 51, skip: 50, maxTimeMS: 2500,
        projection: expect.objectContaining({ logs: 0, utxoXpub: 0 }),
      })
    );
    const rows = res.json.mock.calls[0][0] as Record<string, unknown>[];
    expect(rows).toHaveLength(50);
    expect(rows[0]).toEqual(expect.objectContaining({ id: "0", status: "mint-sysx", logs: [], historyPublic: true }));
    expect(JSON.stringify(rows)).not.toContain(account);
    for (const key of ["utxoXpub", "writeTokenHash", "progressStatus", "historyEvidence"]) {
      expect(rows[0]).not.toHaveProperty(key);
    }
  });

  it("queries UTXO history by evidence only, without scanning drafts or checking providers", async () => {
    const fetched = jest.spyOn(TransferModel.collection, "find").mockImplementation(
      (() => ({ toArray: async () => [] })) as any
    );
    const res = response();
    await handler(request("GET", { utxo }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([]);
    expect(fetched).toHaveBeenCalledWith(
      { $or: [{ "historyEvidence.utxoAddresses": utxo }] },
      expect.objectContaining({ limit: 51, maxTimeMS: 2500 })
    );
  });

  it.each([
    ["GET", { utxo: account }],
    ["POST", { nevm, page: 101 }],
    ["POST", { nevm: [nevm] }],
  ])("rejects invalid %s lookups before querying Mongo", async (method, lookup) => {
    const fetched = jest.spyOn(TransferModel.collection, "find");
    const res = response();
    await handler(request(method, lookup), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(fetched).not.toHaveBeenCalled();
  });
});
