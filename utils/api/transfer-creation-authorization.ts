import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { ITransfer } from "@contexts/Transfer/types";
import { toSyscoinBaseUnits } from "utils/syscoin-amount";
import { getSyscoinChainId, resolveExpectedEvmChainId } from "utils/network-config";
import { verifySignature } from "./verify-signature";
import verifyNevmContractSignature from "./verify-nevm-contract-signature";

const TTL_MS = 5 * 60 * 1000;
const MAX_SIGNATURE_BYTES = 4096;
const creationToken = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

const creationChainId = () => {
  const chainId = resolveExpectedEvmChainId(
    process.env.CHAIN_ID || process.env.NEXT_PUBLIC_CHAIN_ID,
    getSyscoinChainId(process.env.IS_TESTNET === "true")
  );
  if (!chainId) throw new Error("Transfer authorization network is unavailable");
  return chainId;
};

export const isTransferCreationToken = (token: unknown): token is string =>
  typeof token === "string" && creationToken.test(token);

const formatIntent = (
  transfer: ITransfer,
  origin: string,
  writeToken: string,
  chainId: string,
  nonce: string,
  expiresAt: number
) => {
  const toNevm = transfer.type === "sys-to-nevm";
  const nevm = transfer.nevmAddress!.toLowerCase();
  const utxo = transfer.utxoAddress!;
  const asset = toNevm && (transfer.useSysx || transfer.utxoAssetType === "sysx") ? "SYSX" : "SYS";
  return [
    "Syscoin Bridge transfer creation",
    `Origin: ${origin}`,
    `NEVM chain ID: ${Number(chainId)}`,
    `Transfer ID: ${transfer.id}`,
    `Direction: ${toNevm ? "UTXO to NEVM" : "NEVM to UTXO"}`,
    `Source: ${toNevm ? utxo : nevm}`,
    `Destination: ${toNevm ? nevm : utxo}`,
    `Amount: ${transfer.amount} ${asset}`,
    `Amount in base units: ${toSyscoinBaseUnits(transfer.amount)}`,
    `Initial step: ${transfer.status}`,
    `UTXO asset: ${transfer.utxoAssetType ?? "unspecified"}`,
    `Use SYSX: ${transfer.useSysx === true ? "yes" : "no"}`,
    `UTXO account commitment: ${digest(transfer.utxoXpub ?? "")}`,
    `Transfer credential commitment: ${digest(writeToken)}`,
    `Nonce: ${nonce}`,
    `Expires: ${new Date(expiresAt).toISOString()}`,
  ].join("\n");
};

const authenticate = (message: string) => {
  const secret = process.env.SECRET_COOKIE_PASSWORD;
  if (!secret || secret.length < 32) throw new Error("Transfer authorization is unavailable");
  return createHmac("sha256", secret)
    .update(JSON.stringify(["syscoin-bridge-transfer-creation-v1", message]))
    .digest();
};

// Both callers validate the initial transfer payload before formatting it.
export const issueTransferCreationAuthorization = (
  transfer: ITransfer,
  origin: string,
  writeToken: string,
  now = Date.now()
) => {
  const nonce = randomBytes(32).toString("hex");
  const expiresAt = now + TTL_MS;
  const message = formatIntent(transfer, origin, writeToken, creationChainId(), nonce, expiresAt);
  return { challenge: `${nonce}.${expiresAt}.${authenticate(message).toString("hex")}`, message };
};

export const verifyTransferCreationAuthorization = async (
  transfer: ITransfer,
  origin: string | null | undefined,
  writeToken: string,
  authorization: unknown,
  chargeContractVerification: () => Promise<void>,
  now = Date.now()
): Promise<boolean> => {
  if (!origin || !isTransferCreationToken(writeToken) || !authorization ||
      typeof authorization !== "object" || Array.isArray(authorization)) return false;
  const { challenge, signedMessage } = authorization as Record<string, unknown>;
  if (typeof challenge !== "string" || typeof signedMessage !== "string" ||
      signedMessage.length > 2 + MAX_SIGNATURE_BYTES * 2 ||
      !/^0x(?:[0-9a-f]{2})+$/i.test(signedMessage)) return false;
  const parts = /^([a-f0-9]{64})\.([0-9]{13})\.([a-f0-9]{64})$/.exec(challenge);
  if (!parts) return false;

  const [, nonce, expiry, mac] = parts;
  const expiresAt = Number(expiry);
  if (expiresAt <= now || expiresAt > now + TTL_MS) return false;
  const chainId = creationChainId();
  const message = formatIntent(transfer, origin, writeToken, chainId, nonce, expiresAt);
  if (!timingSafeEqual(
    Uint8Array.from(Buffer.from(mac, "hex")),
    Uint8Array.from(authenticate(message))
  )) return false;
  // The transfer ID is unique in Mongo. The signed credential commitment
  // prevents using the signed request to create it with another token.
  try {
    if (verifySignature(message, signedMessage, transfer.nevmAddress!)) return true;
  } catch { /* A smart wallet may use a contract signature envelope. */ }
  await chargeContractVerification();
  return verifyNevmContractSignature(transfer.nevmAddress!, message, signedMessage, chainId);
};
