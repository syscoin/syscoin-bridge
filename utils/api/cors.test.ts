import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { NextApiRequest, NextApiResponse } from "next";
import { applyApiCors } from "./cors";

const createRequest = (origin: string) =>
  ({
    method: "PATCH",
    headers: {
      origin,
      host: "bridge-api.tanenbaum.io",
    },
    socket: {},
  } as unknown as NextApiRequest);

const createResponse = () => {
  const headers = new Map<string, string | number | string[]>();
  const response = {
    getHeader: jest.fn((name: string) => headers.get(name)),
    setHeader: jest.fn((name: string, value: string | number | string[]) => {
      headers.set(name, value);
      return response;
    }),
    status: jest.fn(),
    json: jest.fn(),
    end: jest.fn(),
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  response.end.mockReturnValue(response);
  return response as unknown as NextApiResponse & typeof response;
};

const applyWriteCors = (origin: string) => {
  const response = createResponse();
  const handled = applyApiCors(createRequest(origin), response, {
    allowMethods: ["GET", "PATCH", "OPTIONS"],
  });
  return { handled, response };
};

describe("preview CORS isolation", () => {
  beforeEach(() => {
    process.env.CORS_ALLOWED_ORIGIN = "https://bridge.tanenbaum.io";
    delete process.env.VERCEL_ENV;
  });

  it("reflects the request origin only inside a Vercel preview", () => {
    process.env.VERCEL_ENV = "preview";
    const origin =
      "https://bridge-testnet-git-feature.example-team.vercel.app";
    const { handled, response } = applyWriteCors(origin);

    expect(handled).toBe(false);
    expect(response.setHeader).toHaveBeenCalledWith(
      "Access-Control-Allow-Origin",
      origin
    );
    expect(response.status).not.toHaveBeenCalled();
  });

  it("does not relax origins in Vercel production", () => {
    process.env.VERCEL_ENV = "production";
    const { handled, response } = applyWriteCors(
      "https://untrusted.example"
    );

    expect(handled).toBe(true);
    expect(response.status).toHaveBeenCalledWith(403);
  });

  it("does not relax origins on the Hetzner backend", () => {
    const { handled, response } = applyWriteCors(
      "https://untrusted.example"
    );

    expect(handled).toBe(true);
    expect(response.status).toHaveBeenCalledWith(403);
  });

  it("continues to allow an exact production origin", () => {
    const origin = "https://bridge.tanenbaum.io";
    const { handled, response } = applyWriteCors(origin);

    expect(handled).toBe(false);
    expect(response.setHeader).toHaveBeenCalledWith(
      "Access-Control-Allow-Origin",
      origin
    );
  });
});
