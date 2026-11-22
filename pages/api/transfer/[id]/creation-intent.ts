import type { NextApiHandler } from "next";
import { assertNewTransfer, assertValidTransferPayload, TransferValidationError } from "api/services/transfer-validation";
import { applyApiCors } from "utils/api/cors";
import { getRequestOrigin } from "utils/api/request-origin";
import { isTransferCreationToken, issueTransferCreationAuthorization } from "utils/api/transfer-creation-authorization";
import { getTransferWriteTokens } from "utils/api/transfer-write-capability";

const handler: NextApiHandler = (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (applyApiCors(req, res, {
    allowMethods: ["POST", "OPTIONS"],
    allowWildcardOrigin: false,
  })) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed" });
  }
  const origin = getRequestOrigin(req);
  if (!origin) return res.status(403).json({ message: "Origin required" });
  const [token] = getTransferWriteTokens(req);
  if (!isTransferCreationToken(token)) {
    return res.status(401).json({ message: "Transfer credential required" });
  }
  const { id } = req.query;
  if (typeof id !== "string" || req.body?.id !== id) {
    return res.status(400).json({ message: "Transfer id does not match URL" });
  }

  try {
    assertValidTransferPayload(req.body);
    assertNewTransfer(req.body);
    return res.status(200).json(issueTransferCreationAuthorization(req.body, origin, token));
  } catch (error) {
    if (error instanceof TransferValidationError) {
      return res.status(400).json({ message: error.message });
    }
    throw error;
  }
};

export const config = { api: { bodyParser: { sizeLimit: "8kb" } } };
export default handler;
