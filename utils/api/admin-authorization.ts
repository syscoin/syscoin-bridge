import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import AdminAuthorizationUse from "models/admin-authorization-use";
import { verifySignature } from "./verify-signature";
import { getRequestOrigin as getAdminOrigin } from "./request-origin";

export { getAdminOrigin };

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const REPLAY_RECORD_RETENTION_MS = 24 * 60 * 60 * 1000;

type AuthorizationScope = {
  origin: string;
  address: string;
  operation: "login" | "override" | "add-log";
  sessionId?: string;
  transferId?: string;
  payload?: unknown;
};

const formatAuthorization = (
  scope: AuthorizationScope,
  nonce: string,
  expiresAt: number
) =>
  [
    "Syscoin Bridge Admin authorization",
    `Origin: ${scope.origin}`,
    `Network: ${process.env.CHAIN_ID || process.env.NEXT_PUBLIC_CHAIN_ID || (process.env.IS_TESTNET === "true" ? "Tanenbaum" : "Syscoin mainnet")}`,
    `Wallet: ${scope.address}`,
    `Operation: ${scope.operation}`,
    ...(scope.transferId ? [`Transfer: ${scope.transferId}`] : []),
    ...(scope.payload === undefined ? [] : [`Details: ${JSON.stringify(scope.payload)}`]),
    `Nonce: ${nonce}`,
    `Expires: ${new Date(expiresAt).toISOString()}`,
  ].join("\n");

const authenticate = (message: string, sessionId?: string) => {
  const secret = process.env.SECRET_COOKIE_PASSWORD;
  if (!secret || secret.length < 32) throw new Error("Admin session secret is unavailable");
  return createHmac("sha256", secret)
    .update(JSON.stringify(["syscoin-bridge-admin-challenge-v1", sessionId ?? null, message]))
    .digest("hex");
};

export const issueAdminAuthorization = (scope: AuthorizationScope) => {
  const nonce = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  const message = formatAuthorization(scope, nonce, expiresAt);
  return {
    challenge: `${nonce}.${expiresAt}.${authenticate(message, scope.sessionId)}`,
    message,
  };
};

export const consumeAdminAuthorization = async (
  scope: AuthorizationScope,
  challenge: unknown,
  signedMessage: unknown
): Promise<string | null> => {
  if (typeof challenge !== "string" || typeof signedMessage !== "string") return null;
  const parts = /^([a-f0-9]{64})\.([0-9]{13})\.([a-f0-9]{64})$/.exec(challenge);
  if (!parts) return null;
  const [, nonce, expires, mac] = parts;
  const expiresAt = Number(expires);
  const now = Date.now();
  if (expiresAt <= now || expiresAt > now + CHALLENGE_TTL_MS) return null;
  const message = formatAuthorization(scope, nonce, expiresAt);
  const expectedMac = authenticate(message, scope.sessionId);
  if (!timingSafeEqual(
    Uint8Array.from(Buffer.from(mac, "hex")),
    Uint8Array.from(Buffer.from(expectedMac, "hex"))
  )) return null;
  try {
    if (!verifySignature(message, signedMessage, scope.address)) return null;
  } catch {
    return null;
  }
  await AdminAuthorizationUse.init();
  try {
    // Mongo's unique _id is the replay fence across backend processes. Keep
    // the record beyond expiry so it outlasts clock skew and in-flight requests.
    await AdminAuthorizationUse.create({
      _id: nonce,
      expiresAt: new Date(expiresAt + REPLAY_RECORD_RETENTION_MS),
    });
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) return null;
    throw error;
  }
  return nonce;
};

export const isAdminTransferId = (id: unknown): id is string =>
  typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id);

export const authorizeAdminTransferAction = async (
  req: NextApiRequest,
  res: NextApiResponse,
  operation: "override" | "add-log",
  transferId: string,
  payload: unknown
): Promise<boolean> => {
  const user = req.session.user;
  const origin = getAdminOrigin(req);
  if (!user?.sessionId || !origin) {
    res.status(403).json({ message: "Administrator session and origin required" });
    return false;
  }

  const scope = {
    origin,
    address: user.address,
    sessionId: user.sessionId,
    operation,
    transferId,
    payload,
  };
  const { challenge, signedMessage } = req.body ?? {};
  if (challenge === undefined && signedMessage === undefined) {
    res.status(200).json(issueAdminAuthorization(scope));
    return false;
  }

  if (!(await consumeAdminAuthorization(scope, challenge, signedMessage))) {
    res.status(401).json({ message: "Wallet signature or action challenge is invalid or expired" });
    return false;
  }
  return true;
};
