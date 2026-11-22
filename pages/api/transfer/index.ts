import type { NextApiHandler } from "next";
import {
  MAX_TRANSFER_HISTORY_PAGE,
  TRANSFER_HISTORY_PAGE_SIZE,
  TransferService,
} from "api/services/transfer";
import type { ITransfer } from "@contexts/Transfer/types";
import dbConnect from "lib/mongodb";
import { applyApiCors } from "utils/api/cors";
import { isValidUtxoAccount } from "utils/utxo-account";
import { utils as syscoinUtils } from "syscoinjs-lib";
import { isAddress } from "web3-utils";

const transferService = new TransferService();

const validUtxoAddress = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length > 100) return false;
  try {
    syscoinUtils.bitcoinjs.address.toOutputScript(value,
      process.env.IS_TESTNET === "true"
        ? syscoinUtils.syscoinNetworks.testnet
        : syscoinUtils.syscoinNetworks.mainnet);
    return true;
  } catch {
    return false;
  }
};

const handler: NextApiHandler = async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (applyApiCors(req, res, {
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowWildcardOrigin: req.method === "GET",
  })) return;
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const lookup = req.method === "POST" ? req.body : req.query;
  if (!lookup || typeof lookup !== "object" || Array.isArray(lookup)) {
    return res.status(400).json({ message: "Invalid transfer history lookup" });
  }
  const { nevm, version, page: requestedPage } = lookup;
  const utxo = req.method === "POST" ? lookup.utxoAddress : lookup.utxo;
  const xpub = req.method === "POST" ? lookup.utxoXpub : undefined;
  const page = requestedPage === undefined ? 1 :
    typeof requestedPage === "number" ? requestedPage :
    typeof requestedPage === "string" && /^\d{1,3}$/.test(requestedPage) ? Number(requestedPage) : NaN;
  if (!Number.isInteger(page) || page < 1 || page > MAX_TRANSFER_HISTORY_PAGE ||
      (version !== undefined && version !== "v1" && version !== "v2") ||
      (nevm !== undefined && (typeof nevm !== "string" || !isAddress(nevm))) ||
      (utxo !== undefined && !validUtxoAddress(utxo)) ||
      (xpub !== undefined && !isValidUtxoAccount(xpub))) {
    return res.status(400).json({ message: "Invalid transfer history lookup" });
  }

  res.setHeader("Access-Control-Expose-Headers", "X-Bridge-Has-More");
  if (!nevm && !utxo && !xpub) {
    res.setHeader("X-Bridge-Has-More", "0");
    return res.status(200).json([]);
  }
  await dbConnect();
  const rows = await transferService.getAll({
    nevmAddress: nevm,
    utxoAddress: utxo,
    utxoXpub: xpub,
    version: version as ITransfer["version"] | undefined,
  }, page);

  res.setHeader("X-Bridge-Has-More",
    page < MAX_TRANSFER_HISTORY_PAGE && rows.length > TRANSFER_HISTORY_PAGE_SIZE ? "1" : "0");
  return res.status(200).json(rows.slice(0, TRANSFER_HISTORY_PAGE_SIZE));
};

export const config = { api: { bodyParser: { sizeLimit: "4kb" } } };
export default handler;
