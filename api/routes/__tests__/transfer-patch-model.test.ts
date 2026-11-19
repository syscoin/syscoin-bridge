import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type { NextApiRequest, NextApiResponse } from "next";
import { COMMON_STATUS, ETH_TO_SYS_TRANSFER_STATUS } from "@contexts/Transfer/types";
import TransferModel from "models/transfer";
import { getRequest, patchRequest } from "pages/api/transfer/[id]";

const response = () => {
  const res = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as NextApiResponse & typeof res;
};
const copy = (value: any) => JSON.parse(JSON.stringify(value));
const base = {
  id: "e8d6267c-f818-41b3-9ee0-09b71179c438", type: "nevm-to-sys",
  status: ETH_TO_SYS_TRANSFER_STATUS.FREEZE_BURN_SYS, amount: "1", logs: [],
  createdAt: 1, version: "v2", agreedToTerms: true,
  utxoAddress: "sys1qtrgef9gy95ree902dkltyt4vcku8sg8ank49zp",
  nevmAddress: "0x1111111111111111111111111111111111111111",
};
const request = (body: any) => ({
  query: { id: base.id }, body: copy(body),
  headers: { authorization: "Bearer owner-token" }, socket: {},
}) as unknown as NextApiRequest;

const originalTestnet = process.env.IS_TESTNET;
afterEach(() => {
  jest.restoreAllMocks();
  if (originalTestnet === undefined) delete process.env.IS_TESTNET;
  else process.env.IS_TESTNET = originalTestnet;
});

describe("transfer PATCH through the real service and Mongoose model", () => {
  it("rejects malicious logs and still creates, updates and reads normal transfers", async () => {
    process.env.IS_TESTNET = "false";
    let stored: any = null;
    // Only the MongoDB driver boundary is replaced; routing, validation, capability
    // checks, canonicalization, Mongoose casting and hydration remain real.
    const find = jest.spyOn(TransferModel.collection, "findOne")
      .mockImplementation((async () => stored && copy(stored)) as any);
    const insert = jest.spyOn(TransferModel.collection, "insertOne")
      .mockImplementation((async (doc: any) => {
        stored = copy(doc);
        return { acknowledged: true, insertedId: doc._id };
      }) as any);
    const update = jest.spyOn(TransferModel.collection, "findOneAndUpdate")
      .mockImplementation((async (filter: any, operation: any) => {
        expect(filter.writeTokenHash).toBe(stored.writeTokenHash);
        expect(filter.__v).toBe(stored.__v);
        stored = copy({ ...stored, ...operation.$set,
          __v: stored.__v + operation.$inc.__v });
        return { value: copy(stored) };
      }) as any);
    const created = response();
    await patchRequest(request(base), created);
    expect(created.status).toHaveBeenCalledWith(200);
    expect(insert).toHaveBeenCalledTimes(1);
    const log = { status: COMMON_STATUS.ERROR, date: 2,
      payload: { message: "retry", data: { error: { message: "pending" } } } };
    const variants = [
      { ...log, "payload.toString.call": 1 },
      { ...log, payload: { ...log.payload, "data.toString.call": 1 } },
      { ...log, payload: { ...log.payload,
        data: { error: [{ "valueOf.call": 1 }] } } },
    ];
    for (const malicious of variants) {
      find.mockClear(); update.mockClear(); insert.mockClear();
      const rejected = response();
      await patchRequest(request({ ...base, logs: [malicious] }), rejected);
      expect(rejected.status).toHaveBeenCalledWith(400);
      expect(rejected.setHeader).not.toHaveBeenCalled();
      expect(find).not.toHaveBeenCalled();
      expect(insert).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect(typeof Object.prototype.toString.call).toBe("function");
      expect(typeof Object.prototype.valueOf.call).toBe("function");
      const saved = response();
      await patchRequest(request({ ...base, logs: [log] }), saved);
      expect(saved.status).toHaveBeenCalledWith(200);
      expect(update).toHaveBeenCalledTimes(1);
      const read = response();
      await getRequest(request(null), read);
      expect(read.status).toHaveBeenCalledWith(200);
      expect(read.json).toHaveBeenCalledWith(expect.objectContaining({
        id: base.id, logs: [expect.objectContaining(log)],
      }));
    }
  });
});
