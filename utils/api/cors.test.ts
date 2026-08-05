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

describe("Vercel preview CORS", () => {
  beforeEach(() => {
    process.env.CORS_ALLOWED_ORIGIN = "https://bridge.tanenbaum.io";
    process.env.CORS_ALLOWED_VERCEL_TEAM = "sys-labs-1f6f97e5";
    delete process.env.CORS_ALLOWED_VERCEL_PROJECT;
    process.env.IS_TESTNET = "true";
  });

  it("allows the testnet project's branch preview origin", () => {
    const origin =
      "https://bridge-testnet-git-codex-harden-backen-22c360-sys-labs-1f6f97e5.vercel.app";
    const { handled, response } = applyWriteCors(origin);

    expect(handled).toBe(false);
    expect(response.setHeader).toHaveBeenCalledWith(
      "Access-Control-Allow-Origin",
      origin
    );
    expect(response.status).not.toHaveBeenCalled();
  });

  it("allows the testnet project's deployment-specific preview origin", () => {
    const origin =
      "https://bridge-testnet-56xg4mwgs-sys-labs-1f6f97e5.vercel.app";
    const { handled, response } = applyWriteCors(origin);

    expect(handled).toBe(false);
    expect(response.setHeader).toHaveBeenCalledWith(
      "Access-Control-Allow-Origin",
      origin
    );
  });

  it("allows a trusted preview write when the generic CORS default is wildcard", () => {
    process.env.CORS_ALLOWED_ORIGIN = "*";
    const origin =
      "https://bridge-testnet-git-codex-harden-backen-22c360-sys-labs-1f6f97e5.vercel.app";
    const { handled, response } = applyWriteCors(origin);

    expect(handled).toBe(false);
    expect(response.setHeader).toHaveBeenCalledWith(
      "Access-Control-Allow-Origin",
      origin
    );
  });

  it("rejects the same project name outside the configured Vercel team", () => {
    const { handled, response } = applyWriteCors(
      "https://bridge-testnet-git-attack-other-team.vercel.app"
    );

    expect(handled).toBe(true);
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      message: "Origin not allowed",
    });
  });

  it("rejects another project within the configured Vercel team", () => {
    const { handled, response } = applyWriteCors(
      "https://unrelated-project-123-sys-labs-1f6f97e5.vercel.app"
    );

    expect(handled).toBe(true);
    expect(response.status).toHaveBeenCalledWith(403);
  });

  it("selects the production project for mainnet", () => {
    process.env.IS_TESTNET = "false";
    const origin =
      "https://syscoin-bridge-git-feature-5981fe-sys-labs-1f6f97e5.vercel.app";
    const { handled, response } = applyWriteCors(origin);

    expect(handled).toBe(false);
    expect(response.setHeader).toHaveBeenCalledWith(
      "Access-Control-Allow-Origin",
      origin
    );
  });
});
