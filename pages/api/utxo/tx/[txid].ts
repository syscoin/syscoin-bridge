import type { NextApiRequest, NextApiResponse } from "next";
import { utils as syscoinUtils } from "syscoinjs-lib";
import { applyApiCors } from "utils/api/cors";
import { firstConfiguredUtxoBlockbookUrl } from "utils/syscoin-urls";

const firstQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (
    applyApiCors(req, res, {
      allowMethods: ["GET", "OPTIONS"],
      allowWildcardOrigin: true,
    })
  ) {
    return;
  }

  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const txid = firstQueryValue(req.query.txid);
  if (!txid || !/^[0-9a-fA-F]{64}$/.test(txid)) {
    return res.status(400).json({ message: "Invalid transaction ID" });
  }

  const blockbookUrl = firstConfiguredUtxoBlockbookUrl(
    process.env.UTXO_EXPLORER,
    process.env.UTXO_RPC_URL,
    process.env.NEXT_PUBLIC_BLOCKBOOK_API_URL
  );
  if (!blockbookUrl) {
    return res
      .status(503)
      .json({ message: "UTXO Blockbook is not configured" });
  }

  try {
    const response = await fetch(`${blockbookUrl}/api/v2/tx/${txid}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return res
        .status(response.status)
        .json({ message: "Unable to fetch transaction" });
    }
    const transaction = (await response.json()) as { hex?: unknown };
    if (
      typeof transaction.hex !== "string" ||
      transaction.hex.length % 2 !== 0 ||
      !/^[0-9a-fA-F]+$/.test(transaction.hex)
    ) {
      return res
        .status(502)
        .json({ message: "Blockbook returned an invalid transaction" });
    }

    let previousTransaction;
    try {
      previousTransaction =
        syscoinUtils.bitcoinjs.Transaction.fromHex(transaction.hex);
    } catch {
      return res
        .status(502)
        .json({ message: "Blockbook returned an invalid transaction" });
    }
    if (previousTransaction.getId().toLowerCase() !== txid.toLowerCase()) {
      return res
        .status(502)
        .json({ message: "Blockbook transaction does not match its ID" });
    }

    res.setHeader(
      "Cache-Control",
      "public, max-age=300, s-maxage=31536000, immutable"
    );
    return res.status(200).json({ hex: transaction.hex });
  } catch {
    return res.status(502).json({ message: "UTXO Blockbook is unavailable" });
  }
};

export default handler;
