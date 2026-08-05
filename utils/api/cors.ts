import { NextApiRequest, NextApiResponse } from "next";

interface ApiCorsOptions {
  allowCredentials?: boolean;
  allowWildcardOrigin?: boolean;
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

const stripTrailingSlashes = (value: string) => {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") {
    end -= 1;
  }
  return value.slice(0, end);
};

const normalizeOrigin = (origin: string) =>
  stripTrailingSlashes(origin.trim()).toLowerCase();

const firstForwardedValue = (value?: string) => value?.split(",")[0]?.trim();

const parseOrigin = (origin: string) => {
  try {
    return new URL(origin);
  } catch {
    return null;
  }
};

const isVercelPreviewOrigin = (origin: string) => {
  const parsedOrigin = parseOrigin(origin);
  return (
    parsedOrigin?.protocol === "https:" &&
    parsedOrigin.port === "" &&
    parsedOrigin.hostname.endsWith(".vercel.app")
  );
};

const normalizeHost = (host: string) => host.trim().toLowerCase();

const isLocalhostHost = (host: string) => {
  const hostname = host.split(":")[0];
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
};

const getAllowedOrigins = (): string[] => {
  const rawOrigins = process.env.CORS_ALLOWED_ORIGIN ?? "*";
  return rawOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const isSameOriginRequest = (req: NextApiRequest, origin: string) => {
  const requestOrigin = parseOrigin(origin);
  if (!requestOrigin) {
    return false;
  }

  const forwardedProto = firstForwardedValue(
    normalizeHeaderValue(req.headers["x-forwarded-proto"])
  );
  const forwardedHost = firstForwardedValue(
    normalizeHeaderValue(req.headers["x-forwarded-host"])
  );
  const host = forwardedHost || req.headers.host;

  if (!host) {
    return false;
  }

  const normalizedHost = normalizeHost(host);
  if (normalizeHost(requestOrigin.host) !== normalizedHost) {
    return false;
  }

  if (forwardedProto) {
    return (
      normalizeOrigin(`${forwardedProto}://${normalizedHost}`) ===
      normalizeOrigin(origin)
    );
  }

  const socket = req.socket as typeof req.socket & { encrypted?: boolean };
  if (socket.encrypted) {
    return requestOrigin.protocol === "https:";
  }

  const forwardedPort = firstForwardedValue(
    normalizeHeaderValue(req.headers["x-forwarded-port"])
  );
  if (forwardedPort === "443") {
    return requestOrigin.protocol === "https:";
  }

  if (forwardedPort === "80") {
    return requestOrigin.protocol === "http:";
  }

  if (normalizedHost.endsWith(":443")) {
    return requestOrigin.protocol === "https:";
  }

  if (normalizedHost.endsWith(":80")) {
    return requestOrigin.protocol === "http:";
  }

  if (isLocalhostHost(normalizedHost)) {
    return requestOrigin.protocol === "http:";
  }

  return requestOrigin.protocol === "https:";
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

const resolveCorsOrigin = (
  req: NextApiRequest,
  requestOrigin: string | undefined,
  allowCredentials: boolean,
  allowWildcardOrigin: boolean
): { allowed: boolean; corsOrigin: string | null } => {
  if (!requestOrigin) {
    return { allowed: true, corsOrigin: null };
  }

  const normalizedRequestOrigin = normalizeOrigin(requestOrigin);

  if (isSameOriginRequest(req, normalizedRequestOrigin)) {
    return { allowed: true, corsOrigin: null };
  }

  // Preview deployments intentionally reflect their request origin so branch
  // builds can exercise write flows. The external Tanenbaum API does the same
  // only for HTTPS Vercel origins and only when running in testnet mode.
  // Mainnet backends continue to require an exact configured origin.
  if (
    process.env.VERCEL_ENV === "preview" ||
    (process.env.IS_TESTNET === "true" &&
      isVercelPreviewOrigin(normalizedRequestOrigin))
  ) {
    return { allowed: true, corsOrigin: normalizedRequestOrigin };
  }

  const allowedOrigins = getAllowedOrigins().map((origin) =>
    origin === "*" ? origin : normalizeOrigin(origin)
  );
  if (allowedOrigins.includes("*")) {
    return allowCredentials || !allowWildcardOrigin
      ? { allowed: false, corsOrigin: null }
      : { allowed: true, corsOrigin: "*" };
  }

  return allowedOrigins.includes(normalizedRequestOrigin)
    ? { allowed: true, corsOrigin: normalizedRequestOrigin }
    : { allowed: false, corsOrigin: null };
};

export const applyApiCors = (
  req: NextApiRequest,
  res: NextApiResponse,
  options: ApiCorsOptions = {}
) => {
  const {
    allowCredentials = false,
    allowWildcardOrigin = false,
    allowMethods = DEFAULT_ALLOWED_METHODS,
    allowHeaders = DEFAULT_ALLOWED_HEADERS,
  } = options;
  const requestOrigin = normalizeHeaderValue(req.headers.origin);
  const { allowed, corsOrigin } = resolveCorsOrigin(
    req,
    requestOrigin,
    allowCredentials,
    allowWildcardOrigin
  );

  if (corsOrigin) {
    const requestedHeaders = normalizeHeaderValue(
      req.headers["access-control-request-headers"]
    );
    res.setHeader("Access-Control-Allow-Origin", corsOrigin);
    res.setHeader("Access-Control-Allow-Methods", allowMethods.join(", "));
    res.setHeader(
      "Access-Control-Allow-Headers",
      requestedHeaders || allowHeaders.join(", ")
    );
    if (allowCredentials && corsOrigin !== "*") {
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    if (corsOrigin !== "*") {
      appendVaryOrigin(res);
    }
  }

  if (req.method === "OPTIONS") {
    if (allowed) {
      res.status(204).end();
      return true;
    }

    res.status(403).json({ message: "Origin not allowed" });
    return true;
  }

  if (!allowed) {
    res.status(403).json({ message: "Origin not allowed" });
    return true;
  }

  return false;
};
