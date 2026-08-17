import type { NextApiRequest, NextApiResponse } from "next";

const WRITE_TOKEN_COOKIE = "transfer-write-token";
const WRITE_TOKEN_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const MAX_WRITE_TOKEN_CANDIDATES = 4;

const firstHeaderValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

const getBearerToken = (req: NextApiRequest): string | undefined => {
  const authorization = firstHeaderValue(req.headers.authorization);
  if (!authorization?.startsWith("Bearer ")) {
    return undefined;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token || undefined;
};

const getCookieTokens = (req: NextApiRequest): string[] => {
  const cookieHeader = firstHeaderValue(req.headers.cookie);
  if (!cookieHeader) {
    return [];
  }

  return cookieHeader.split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    if (
      separator === -1 ||
      part.slice(0, separator).trim() !== WRITE_TOKEN_COOKIE
    ) {
      return [];
    }

    try {
      const token = decodeURIComponent(part.slice(separator + 1).trim());
      return token ? [token] : [];
    } catch {
      return [];
    }
  });
};

export const getTransferWriteTokens = (req: NextApiRequest): string[] =>
  Array.from(
    new Set(
      [getBearerToken(req), ...getCookieTokens(req)].filter(Boolean) as string[]
    )
  ).slice(0, MAX_WRITE_TOKEN_CANDIDATES);

const isSecureRequest = (req: NextApiRequest) => {
  const forwardedProto = firstHeaderValue(req.headers["x-forwarded-proto"])
    ?.split(",")[0]
    ?.trim();
  const socket = req.socket as typeof req.socket & { encrypted?: boolean };
  return forwardedProto === "https" || socket.encrypted === true;
};

export const setTransferWriteTokenCookie = (
  req: NextApiRequest,
  res: NextApiResponse,
  transferId: string,
  writeToken: string
) => {
  const attributes = [
    `${WRITE_TOKEN_COOKIE}=${encodeURIComponent(writeToken)}`,
    `Path=/api/transfer/${encodeURIComponent(transferId)}`,
    `Max-Age=${WRITE_TOKEN_COOKIE_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Strict",
  ];
  if (isSecureRequest(req)) {
    attributes.push("Secure");
  }
  res.setHeader("Set-Cookie", attributes.join("; "));
};
