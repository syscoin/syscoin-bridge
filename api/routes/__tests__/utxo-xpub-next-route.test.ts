import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type { NextApiRequest, NextApiResponse } from "next";
import handler from "../../../pages/api/utxo/xpub/[xpub]";

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

const createRequest = (details = "basic") =>
  ({
    method: "GET",
    headers: {},
    query: { xpub: "vpub-test", details },
    socket: {},
  } as unknown as NextApiRequest);

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
  jest.restoreAllMocks();
});

describe("UTXO xpub proxy", () => {
  it("falls back to the configured UTXO RPC and proxies the response", async () => {
    delete process.env.UTXO_EXPLORER;
    process.env.UTXO_RPC_URL = "https://testnet-blockbook.example";
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
      status: 200,
      text: async () => '{"balance":"1"}',
      headers: { get: () => "application/json" },
    } as unknown as Response);
    const response = createResponse();

    await handler(createRequest(), response);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://testnet-blockbook.example/api/v2/xpub/vpub-test?details=basic",
      { headers: { Accept: "application/json" } }
    );
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('{"balance":"1"}');
  });

  it("only forwards supported detail modes", async () => {
    process.env.UTXO_EXPLORER = "https://testnet-blockbook.example";
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
      status: 200,
      text: async () => "{}",
      headers: { get: () => "application/json" },
    } as unknown as Response);

    await handler(createRequest("everything"), createResponse());

    expect(fetchMock).toHaveBeenCalledWith(
      "https://testnet-blockbook.example/api/v2/xpub/vpub-test?details=basic",
      { headers: { Accept: "application/json" } }
    );
  });

  it("fails clearly when no Blockbook endpoint is configured", async () => {
    delete process.env.UTXO_EXPLORER;
    delete process.env.UTXO_RPC_URL;
    delete process.env.NEXT_PUBLIC_BLOCKBOOK_API_URL;
    const fetchMock = jest.spyOn(global, "fetch");
    const response = createResponse();

    await handler(createRequest(), response);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(503);
    expect(response.body).toEqual({
      message: "UTXO Blockbook is not configured",
    });
  });
});
