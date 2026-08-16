import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type { NextApiRequest, NextApiResponse } from "next";
import { utils as syscoinUtils } from "syscoinjs-lib";
import handler from "../../../pages/api/utxo/tx/[txid]";

type MockResponse = NextApiResponse & {
  body?: unknown;
  statusCode: number;
};

const createResponse = (): MockResponse => {
  const headers = new Map<string, string | string[]>();
  const response: {
    body?: unknown;
    statusCode: number;
    [key: string]: unknown;
  } = {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    send(body: unknown) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
    setHeader(name: string, value: string | string[]) {
      headers.set(name, value);
      return this;
    },
    getHeader(name: string) {
      return headers.get(name);
    },
  };
  return response as unknown as MockResponse;
};

const createRequest = (txid = "ab".repeat(32)) =>
  ({
    method: "GET",
    headers: {},
    query: { txid },
    socket: {},
  } as unknown as NextApiRequest);

const originalEnvironment = { ...process.env };

const createTransaction = () => {
  const transaction = new syscoinUtils.bitcoinjs.Transaction();
  transaction.addInput(Buffer.alloc(32), 0xffffffff);
  transaction.addOutput(
    Buffer.from("00140000000000000000000000000000000000000001", "hex"),
    BigInt(5_000)
  );
  transaction.ins[0].witness = [Buffer.alloc(64, 1)];
  return transaction;
};

afterEach(() => {
  process.env = { ...originalEnvironment };
  jest.restoreAllMocks();
});

describe("UTXO transaction proxy", () => {
  it("returns only immutable raw transaction data", async () => {
    process.env.UTXO_EXPLORER = "https://testnet-blockbook.example";
    const transaction = createTransaction();
    const txid = transaction.getId();
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ confirmations: 5, hex: transaction.toHex() }),
    } as Response);
    const response = createResponse();

    await handler(createRequest(txid), response);

    expect(fetchMock).toHaveBeenCalledWith(
      `https://testnet-blockbook.example/api/v2/tx/${txid}`,
      { headers: { Accept: "application/json" } }
    );
    expect(response.statusCode).toBe(200);
    const nonWitnessTransaction = transaction.clone();
    nonWitnessTransaction.stripWitnesses();
    expect(response.body).toEqual({ hex: nonWitnessTransaction.toHex() });
    expect(response.getHeader("Cache-Control")).toContain("immutable");
  });

  it("rejects transaction data that does not match the requested ID", async () => {
    process.env.UTXO_EXPLORER = "https://testnet-blockbook.example";
    const transaction = createTransaction();
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ hex: transaction.toHex() }),
    } as Response);
    const response = createResponse();

    await handler(createRequest("ab".repeat(32)), response);

    expect(response.statusCode).toBe(502);
    expect(response.body).toEqual({
      message: "Blockbook transaction does not match its ID",
    });
  });

  it("rejects malformed transaction IDs without contacting Blockbook", async () => {
    process.env.UTXO_EXPLORER = "https://testnet-blockbook.example";
    const fetchMock = jest.spyOn(global, "fetch");
    const response = createResponse();

    await handler(createRequest("not-a-txid"), response);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ message: "Invalid transaction ID" });
  });

  it("rejects a Blockbook response without valid transaction hex", async () => {
    process.env.UTXO_EXPLORER = "https://testnet-blockbook.example";
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ hex: "not-hex" }),
    } as Response);
    const response = createResponse();

    await handler(createRequest(), response);

    expect(response.statusCode).toBe(502);
    expect(response.body).toEqual({
      message: "Blockbook returned an invalid transaction",
    });
  });
});
