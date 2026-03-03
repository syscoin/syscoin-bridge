import { NextApiRequest, NextApiResponse } from "next";

interface ApiCorsOptions {
  allowCredentials?: boolean;
  allowMethods?: string[];
  allowHeaders?: string[];
}

const DEFAULT_ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const DEFAULT_ALLOWED_HEADERS = [
  "Content-Type",
  "Authorization",
  "X-Requested-With",
];

const normalizeHeaderValue = (value?: string | string[]) =>
  Array.isArray(value) ? value[0] : value;

const normalizeOrigin = (origin: string) =>
  origin.trim().replace(/\/+$/, "").toLowerCase();

const firstForwardedValue = (value?: string) => value?.split(",")[0]?.trim();

const getAllowedOrigins = (): string[] => {
  const rawOrigins = process.env.CORS_ALLOWED_ORIGIN ?? "*";
  return rawOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const isSameOriginRequest = (req: NextApiRequest, origin: string) => {
  const forwardedProto = firstForwardedValue(
    normalizeHeaderValue(req.headers["x-forwarded-proto"])
  );
  const proto = forwardedProto || "http";
  const forwardedHost = firstForwardedValue(
    normalizeHeaderValue(req.headers["x-forwarded-host"])
  );
  const host = forwardedHost || req.headers.host;

  if (!host) {
    return false;
  }

  return normalizeOrigin(`${proto}://${host}`) === normalizeOrigin(origin);
};

const appendVaryOrigin = (res: NextApiResponse) => {
  const currentVary = res.getHeader("Vary");
  if (!currentVary) {
    res.setHeader("Vary", "Origin");
    return;
  }

  const varyValue = Array.isArray(currentVary)
    ? currentVary.join(", ")
    : String(currentVary);
  const varyParts = varyValue
    .split(",")
    .map((part) => part.trim().toLowerCase());

  if (!varyParts.includes("origin")) {
    res.setHeader("Vary", `${varyValue}, Origin`);
  }
};

const resolveAllowedOrigin = (
  req: NextApiRequest,
  requestOrigin: string | undefined,
  allowCredentials: boolean
) => {
  if (!requestOrigin) {
    return null;
  }

  const normalizedRequestOrigin = normalizeOrigin(requestOrigin);

  if (isSameOriginRequest(req, normalizedRequestOrigin)) {
    return normalizedRequestOrigin;
  }

  const allowedOrigins = getAllowedOrigins().map((origin) =>
    origin === "*" ? origin : normalizeOrigin(origin)
  );
  if (allowedOrigins.includes("*")) {
    return allowCredentials ? null : "*";
  }

  return allowedOrigins.includes(normalizedRequestOrigin)
    ? normalizedRequestOrigin
    : null;
};

export const applyApiCors = (
  req: NextApiRequest,
  res: NextApiResponse,
  options: ApiCorsOptions = {}
) => {
  const {
    allowCredentials = false,
    allowMethods = DEFAULT_ALLOWED_METHODS,
    allowHeaders = DEFAULT_ALLOWED_HEADERS,
  } = options;
  const requestOrigin = normalizeHeaderValue(req.headers.origin);
  const allowedOrigin = resolveAllowedOrigin(
    req,
    requestOrigin,
    allowCredentials
  );

  if (allowedOrigin) {
    const requestedHeaders = normalizeHeaderValue(
      req.headers["access-control-request-headers"]
    );
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Methods", allowMethods.join(", "));
    res.setHeader(
      "Access-Control-Allow-Headers",
      requestedHeaders || allowHeaders.join(", ")
    );
    if (allowCredentials) {
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    if (allowedOrigin !== "*") {
      appendVaryOrigin(res);
    }
  }

  if (req.method === "OPTIONS") {
    if (!requestOrigin || allowedOrigin) {
      res.status(204).end();
      return true;
    }

    res.status(403).json({ message: "Origin not allowed" });
    return true;
  }

  if (requestOrigin && !allowedOrigin) {
    res.status(403).json({ message: "Origin not allowed" });
    return true;
  }

  return false;
};
