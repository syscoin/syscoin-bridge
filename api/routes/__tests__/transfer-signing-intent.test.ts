import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ETH_TO_SYS_TRANSFER_STATUS } from "@contexts/Transfer/types";
import { createHash } from "crypto";
import TransferModel from "models/transfer";
import type { NextApiRequest, NextApiResponse } from "next";
import handler from "pages/api/transfer/[id]/signing-intent";
import { utils as syscoinUtils } from "syscoinjs-lib";

jest.mock("lib/mongodb", () => ({ __esModule: true, default: jest.fn() }));

const token = "private-capability";
const transfer = {
  id: "saved-transfer",
  type: "nevm-to-sys",
  status: ETH_TO_SYS_TRANSFER_STATUS.FREEZE_BURN_SYS,
  amount: "1.25",
  nevmAddress: "0x1111111111111111111111111111111111111111",
  utxoAddress: "sys1qtrgef9gy95ree902dkltyt4vcku8sg8ank49zp",
  utxoXpub: syscoinUtils.bitcoinjs.bip32
    .fromSeed(Buffer.alloc(32, 1), syscoinUtils.syscoinNetworks.mainnet)
    .neutered().toBase58(),
  logs: [],
  writeTokenHash: createHash("sha256").update(token).digest("hex"),
  progressStatus: ETH_TO_SYS_TRANSFER_STATUS.FREEZE_BURN_SYS,
  agreedToTerms: true,
  createdAt: 1,
  version: "v2",
};

const makeResponse = () => {
  const res = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as NextApiResponse & typeof res;
};

const makeRequest = (
  headers: NextApiRequest["headers"] = {},
  method = "GET",
  id: string | string[] = transfer.id
) => ({ method, query: { id }, headers, socket: {} }) as unknown as NextApiRequest;

const originalTestnet = process.env.IS_TESTNET;

beforeEach(() => {
  process.env.IS_TESTNET = "false";
});

afterEach(() => {
  jest.restoreAllMocks();
  if (originalTestnet === undefined) delete process.env.IS_TESTNET;
  else process.env.IS_TESTNET = originalTestnet;
});

describe("GET transfer signing intent", () => {
  it.each([
    { authorization: `Bearer ${token}` },
    { cookie: `transfer-write-token=${token}` },
    { authorization: "Bearer stale-capability", cookie: `transfer-write-token=${token}` },
  ])("returns a non-cacheable intent to a matching capability", async (headers) => {
    const findOne = jest.spyOn(TransferModel.collection, "findOne")
      .mockImplementation((async () => transfer) as any);
    const res = makeResponse();
    await handler(makeRequest(headers), res);

    expect(findOne).toHaveBeenCalledWith({ id: { $eq: transfer.id } }, expect.anything());
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(res.json).toHaveBeenCalledWith({
      id: transfer.id,
      type: transfer.type,
      status: transfer.status,
      amount: transfer.amount,
      nevmAddress: transfer.nevmAddress,
      utxoAddress: transfer.utxoAddress,
      utxoXpub: transfer.utxoXpub,
    });
  });

  it.each([{}, { authorization: "Bearer another-capability" }])("keeps the signing intent private", async (headers) => {
    jest.spyOn(TransferModel.collection, "findOne")
      .mockImplementation((async () => transfer) as any);
    const res = makeResponse();
    await handler(makeRequest(headers), res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Transfer write is not authorized" });
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  });

  it("fails closed for a malformed saved transfer", async () => {
    jest.spyOn(TransferModel.collection, "findOne")
      .mockImplementation((async () => ({ ...transfer, utxoAddress: "" })) as any);
    const res = makeResponse();
    await handler(makeRequest({ authorization: `Bearer ${token}` }), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ message: expect.any(String) });
  });
});
