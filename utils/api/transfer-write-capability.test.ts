import { describe, expect, it, jest } from "@jest/globals";
import type { NextApiRequest, NextApiResponse } from "next";
import {
  getTransferWriteTokens,
  setTransferWriteTokenCookie,
} from "./transfer-write-capability";

const request = (headers: NextApiRequest["headers"] = {}) =>
  ({ headers, socket: {} }) as NextApiRequest;

describe("transfer write capability transport", () => {
  it("returns distinct bearer and backup-cookie candidates", () => {
    expect(
      getTransferWriteTokens(
        request({
          authorization: "Bearer replacement-token",
          cookie:
            "unrelated=value; transfer-write-token=original-token; transfer-write-token=original-token",
        })
      )
    ).toEqual(["replacement-token", "original-token"]);
  });

  it("ignores malformed capability cookies", () => {
    expect(
      getTransferWriteTokens(
        request({ cookie: "transfer-write-token=%E0%A4%A" })
      )
    ).toEqual([]);
  });

  it("sets an HttpOnly, transfer-scoped secure backup cookie", () => {
    const response = { setHeader: jest.fn() } as unknown as NextApiResponse;

    setTransferWriteTokenCookie(
      request({ "x-forwarded-proto": "https" }),
      response,
      "transfer/id",
      "write token"
    );

    expect(response.setHeader).toHaveBeenCalledWith(
      "Set-Cookie",
      expect.stringContaining(
        "transfer-write-token=write%20token; Path=/api/transfer/transfer%2Fid;"
      )
    );
    const cookie = (response.setHeader as jest.Mock).mock.calls[0][1] as string;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Secure");
  });
});
