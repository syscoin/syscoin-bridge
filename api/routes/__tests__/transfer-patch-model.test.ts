import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { NextApiRequest, NextApiResponse } from "next";
import { COMMON_STATUS, ETH_TO_SYS_TRANSFER_STATUS, ITransfer, SYS_TO_ETH_TRANSFER_STATUS } from "@contexts/Transfer/types";
import { ecsign, hashPersonalMessage, privateToAddress, toRpcSig } from "ethereumjs-util";
import { utils as syscoinUtils } from "syscoinjs-lib";
import TransferModel from "models/transfer";
import TransferCreateQuota from "models/transfer-create-quota";
import { getRequest, patchRequest } from "pages/api/transfer/[id]";
import creationIntent from "pages/api/transfer/[id]/creation-intent";
import { issueTransferCreationAuthorization } from "utils/api/transfer-creation-authorization";

jest.mock("utils/api/verify-nevm-contract-signature", () => ({
  __esModule: true,
  default: jest.fn(async () => false),
}));

const response = () => {
  const res = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as NextApiResponse & typeof res;
};
const copy = (value: any) => JSON.parse(JSON.stringify(value));
const origin = "https://bridge.example";
const token = "a4ccd5a8-2651-482e-8556-f44ca37e2bc1";
const otherToken = "a5ccd5a8-2651-482e-8556-f44ca37e2bc1";
const signer = Buffer.alloc(32, 1);
const address = (key: Buffer) => `0x${privateToAddress(key).toString("hex")}`;
const signature = (message: string, key = signer) => {
  const { v, r, s } = ecsign(hashPersonalMessage(Buffer.from(message)), key);
  return toRpcSig(v, r, s);
};
const base: ITransfer = {
  id: "e8d6267c-f818-41b3-9ee0-09b71179c438", type: "nevm-to-sys",
  status: ETH_TO_SYS_TRANSFER_STATUS.FREEZE_BURN_SYS, amount: "1", logs: [],
  createdAt: 1, version: "v2", agreedToTerms: true,
  utxoAddress: "sys1qtrgef9gy95ree902dkltyt4vcku8sg8ank49zp",
  nevmAddress: address(signer),
  utxoXpub: syscoinUtils.bitcoinjs.bip32
    .fromSeed(Buffer.alloc(32, 1), syscoinUtils.syscoinNetworks.mainnet)
    .neutered().toBase58(),
};
const request = (body: any, options?: { token?: string | null; origin?: string | null; method?: string; id?: string }) => ({
  method: options?.method ?? "PATCH",
  query: { id: options?.id ?? body?.id ?? base.id }, body: copy(body),
  headers: {
    host: "bridge.example",
    origin: options?.origin === null ? undefined : options?.origin ?? origin,
    authorization: options?.token === null ? undefined : `Bearer ${options?.token ?? token}`,
  },
  socket: { encrypted: true },
}) as unknown as NextApiRequest;

const originalTestnet = process.env.IS_TESTNET;
const originalSecret = process.env.SECRET_COOKIE_PASSWORD;
beforeEach(() => {
  process.env.IS_TESTNET = "false";
  process.env.SECRET_COOKIE_PASSWORD = "transfer-creation-test-secret-at-least-32-characters";
});
afterEach(() => {
  jest.restoreAllMocks();
  if (originalTestnet === undefined) delete process.env.IS_TESTNET;
  else process.env.IS_TESTNET = originalTestnet;
  if (originalSecret === undefined) delete process.env.SECRET_COOKIE_PASSWORD;
  else process.env.SECRET_COOKIE_PASSWORD = originalSecret;
});

describe("transfer PATCH through the real service and Mongoose model", () => {
  it.each<ITransfer>([
    base,
    { ...base, type: "sys-to-nevm", status: SYS_TO_ETH_TRANSFER_STATUS.BURN_SYSX,
      useSysx: true, utxoAssetType: "sysx" },
  ])("creates $type from a signed challenge and continues with the original token", async (candidate) => {
    let stored: any = null;
    // Only the MongoDB driver boundary is replaced; routing, validation, capability
    // checks, canonicalization, Mongoose casting and hydration remain real.
    const charge = jest.spyOn(TransferCreateQuota, "updateOne")
      .mockResolvedValue({ acknowledged: true, modifiedCount: 1, upsertedCount: 0, matchedCount: 1, upsertedId: null });
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
    const prepared = response();
    await creationIntent(request(candidate, { method: "POST" }), prepared);
    expect(prepared.status).toHaveBeenCalledWith(200);
    expect(prepared.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    const { challenge, message } = prepared.json.mock.calls[0][0] as { challenge: string; message: string };
    expect(message).toContain(`Transfer ID: ${candidate.id}`);
    expect(message).toContain(`Direction: ${candidate.type === "sys-to-nevm" ? "UTXO to NEVM" : "NEVM to UTXO"}`);
    expect(message).not.toContain(candidate.utxoXpub!);
    expect(message).not.toContain(token);
    expect(find).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();

    const created = response();
    await patchRequest(request({ ...candidate, historyPublic: true,
      historyEvidence: { sourceTransactionHash: "unverified", utxoAddresses: [candidate.utxoAddress] },
      creationAuthorization: {
      challenge, signedMessage: signature(message),
    } }), created);
    expect(created.status).toHaveBeenCalledWith(200);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(charge).toHaveBeenCalledTimes(1);
    expect(stored).not.toHaveProperty("creationAuthorization");
    expect(stored).not.toHaveProperty("historyEvidence");
    expect(stored).not.toHaveProperty("historyPublic");
    expect(created.json).toHaveBeenCalledWith(expect.not.objectContaining({ creationAuthorization: expect.anything() }));
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
      await patchRequest(request({ ...candidate, logs: [malicious] }), rejected);
      expect(rejected.status).toHaveBeenCalledWith(400);
      expect(rejected.setHeader).not.toHaveBeenCalled();
      expect(find).not.toHaveBeenCalled();
      expect(insert).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect(typeof Object.prototype.toString.call).toBe("function");
      expect(typeof Object.prototype.valueOf.call).toBe("function");
      const saved = response();
      await patchRequest(request({ ...candidate, logs: [log] }), saved);
      expect(saved.status).toHaveBeenCalledWith(200);
      expect(update).toHaveBeenCalledTimes(1);
      expect(charge).toHaveBeenCalledTimes(1);
      const read = response();
      await getRequest(request(null), read);
      expect(read.status).toHaveBeenCalledWith(200);
      expect(read.json).toHaveBeenCalledWith(expect.objectContaining({
        id: candidate.id, logs: [expect.objectContaining(log)], historyPublic: false,
      }));
    }
    const publicRead = response();
    await getRequest(request(null, { token: null, origin: null, method: "GET" }), publicRead);
    expect(publicRead.status).toHaveBeenCalledWith(404);
    expect(publicRead.json).toHaveBeenCalledWith({ message: "Transfer not found" });
    const wrongTokenRead = response();
    await getRequest(request(null, { token: otherToken, method: "GET" }), wrongTokenRead);
    expect(wrongTokenRead.status).toHaveBeenCalledWith(404);
    expect(wrongTokenRead.json).toHaveBeenCalledWith({ message: "Transfer not found" });
  });

  it.each([
    { name: "no signature", auth: false },
    { name: "different signer", key: Buffer.alloc(32, 2) },
    { name: "changed amount", overrides: { amount: "2" } },
    { name: "changed direction", overrides: { type: "sys-to-nevm", status: SYS_TO_ETH_TRANSFER_STATUS.BURN_SYS } },
    { name: "changed destination", overrides: { utxoAddress: syscoinUtils.bitcoinjs.payments.p2wpkh({
      hash: Buffer.alloc(20, 2), network: syscoinUtils.syscoinNetworks.mainnet,
    }).address } },
    { name: "different transfer ID", overrides: { id: "e8d6267c-f818-41b3-9ee0-09b71179c439" } },
    { name: "different credential", token: otherToken },
    { name: "different origin", origin: "https://other.example" },
    { name: "expired challenge", expired: true },
  ])("refuses creation with $name", async (entry) => {
    jest.spyOn(TransferModel.collection, "findOne").mockImplementation((async () => null) as any);
    const insert = jest.spyOn(TransferModel.collection, "insertOne").mockImplementation((async () => ({})) as any);
    const charge = jest.spyOn(TransferCreateQuota, "updateOne")
      .mockResolvedValue({ acknowledged: true, modifiedCount: 1, upsertedCount: 0, matchedCount: 1, upsertedId: null });
    const { challenge, message } = issueTransferCreationAuthorization(
      base, origin, token, entry.expired ? Date.now() - 5 * 60 * 1000 : undefined
    );
    const body = { ...base, ...entry.overrides, ...(entry.auth === false ? {} : {
      creationAuthorization: { challenge, signedMessage: signature(message, entry.key) },
    }) };
    const denied = response();
    await patchRequest(request(body, { token: entry.token, origin: entry.origin }), denied);
    expect(denied.status).toHaveBeenCalledWith(401);
    expect(denied.setHeader).not.toHaveBeenCalledWith("Set-Cookie", expect.anything());
    expect(insert).not.toHaveBeenCalled();
    if (!entry.key) expect(charge).not.toHaveBeenCalled();
  });

  it.each([
    { name: "GET", status: 405, request: request(base, { method: "GET" }) },
    { name: "no origin", status: 403, request: request(base, { method: "POST", origin: null }) },
    { name: "no credential", status: 401, request: request(base, { method: "POST", token: null }) },
    { name: "URL ID mismatch", status: 400, request: request(base, { method: "POST", id: "wrong-id" }) },
    { name: "non-initial state", status: 400, request: request({ ...base, status: "completed" }, { method: "POST" }) },
  ])("declines to issue a challenge with $name", async ({ request, status }) => {
    const denied = response();
    await creationIntent(request, denied);
    expect(denied.status).toHaveBeenCalledWith(status);
    expect(denied.json).toHaveBeenCalledWith(expect.not.objectContaining({ challenge: expect.anything() }));
  });
});
