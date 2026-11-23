import { createHash } from "crypto";
import { BlockList, isIP } from "net";
import type { ITransfer } from "@contexts/Transfer/types";
import type { NextApiRequest } from "next";
import TransferCreateQuota from "models/transfer-create-quota";

const WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_LIMIT = 120;
const privatePeers = new BlockList();
privatePeers.addSubnet("127.0.0.0", 8);
privatePeers.addSubnet("10.0.0.0", 8);
privatePeers.addSubnet("172.16.0.0", 12);
privatePeers.addSubnet("192.168.0.0", 16);
privatePeers.addAddress("::1", "ipv6");
privatePeers.addSubnet("fc00::", 7, "ipv6");
privatePeers.addSubnet("fe80::", 10, "ipv6");

export class TransferCreateLimitError extends Error {
  constructor(readonly retryAfter: number) {
    super("Too many transfers started. Try again shortly.");
    this.name = "TransferCreateLimitError";
    Object.setPrototypeOf(this, TransferCreateLimitError.prototype);
  }
}

export const transferQuotaClient = (
  req: NextApiRequest,
  transfer: Pick<ITransfer, "nevmAddress" | "utxoAddress">
): string => {
  // This header is only trustworthy when the origin is reachable solely via
  // an ingress that sets it itself and strips client-supplied copies.
  const forwarded = req.headers?.["cf-connecting-ip"];
  if (process.env.TRANSFER_TRUST_CLOUDFLARE === "true" &&
      typeof forwarded === "string" && isIP(forwarded)) return forwarded;
  const socketAddress = req.socket?.remoteAddress?.replace(/^::ffff:/i, "");
  const family = socketAddress ? isIP(socketAddress) : 0;
  if (socketAddress && family && !privatePeers.check(socketAddress, family === 4 ? "ipv4" : "ipv6")) {
    return socketAddress;
  }
  // A private proxy frequently shares one connection address across all
  // users. Keep its fallback quota scoped to the wallet pair.
  return JSON.stringify([transfer.nevmAddress?.toLowerCase(), transfer.utxoAddress]);
};

export const chargeTransferCreation = async (
  client: string,
  now = Date.now()
): Promise<void> => {
  const configuredLimit = Number(process.env.TRANSFER_CREATE_LIMIT);
  const limit = Number.isSafeInteger(configuredLimit) && configuredLimit > 0
    ? configuredLimit : DEFAULT_LIMIT;
  const window = Math.floor(now / WINDOW_MS);
  const endsAt = (window + 1) * WINDOW_MS;
  const key = createHash("sha256").update(window + ":" + client).digest("hex");
  const filter = { _id: key, count: { $lt: limit } };
  const update = { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(endsAt) } };
  try {
    await TransferCreateQuota.updateOne(filter, update, { upsert: true });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    // A peer may have opened the bucket between lookup and insert, or it
    // may have used the final slot. Only a bounded update can resolve it.
    const result = await TransferCreateQuota.updateOne(filter, update);
    if (!result.matchedCount) {
      throw new TransferCreateLimitError(Math.ceil((endsAt - now) / 1000));
    }
  }
};
