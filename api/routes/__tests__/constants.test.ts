import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type { NextApiRequest, NextApiResponse } from "next";
import handler from "../../../pages/api/constants";

type MockResponse = NextApiResponse & {
  body?: { explorer: { nevm?: string; utxo?: string } };
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

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
  jest.restoreAllMocks();
});

describe("bridge constants", () => {
  it("returns explorer URL bases without trailing slashes", () => {
    process.env.NEVM_EXPLORER = "https://explorer.nevm.example///";
    process.env.UTXO_EXPLORER = "https://explorer.utxo.example/";
    const response = createResponse();

    handler(
      {
        method: "GET",
        headers: {},
        socket: {},
      } as unknown as NextApiRequest,
      response
    );

    expect(response.statusCode).toBe(200);
    expect(response.body?.explorer).toEqual({
      nevm: "https://explorer.nevm.example",
      utxo: "https://explorer.utxo.example",
    });
  });
});
