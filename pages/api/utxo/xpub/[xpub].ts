import type { NextApiRequest, NextApiResponse } from "next";
import { applyApiCors } from "utils/api/cors";
import { firstConfiguredUtxoBlockbookUrl } from "utils/syscoin-urls";

const allowedDetails = new Set(["basic", "tokenBalances"]);

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

  const xpub = firstQueryValue(req.query.xpub);
  if (!xpub) {
    return res.status(400).json({ message: "Missing xpub" });
  }

  const requestedDetails = firstQueryValue(req.query.details);
  const details =
    requestedDetails && allowedDetails.has(requestedDetails)
      ? requestedDetails
      : "basic";
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
    const response = await fetch(
      `${blockbookUrl}/api/v2/xpub/${encodeURIComponent(
        xpub
      )}?details=${details}`,
      { headers: { Accept: "application/json" } }
    );
    const body = await response.text();
    const contentType = response.headers.get("content-type");
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }
    return res.status(response.status).send(body);
  } catch {
    return res.status(502).json({ message: "UTXO Blockbook is unavailable" });
  }
};

export default handler;
