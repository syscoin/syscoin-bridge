import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "lib/mongodb";
import { TransferService, TransferNotFoundError, TransferWriteConflictError, TransferWriteUnauthorizedError } from "api/services/transfer";
import { TransferValidationError } from "api/services/transfer-validation";
import { applyApiCors } from "utils/api/cors";
import { getTransferWriteTokens } from "utils/api/transfer-write-capability";

const service = new TransferService();

export default async function recoverFreezeBurn(req: NextApiRequest, res: NextApiResponse) {
  if (applyApiCors(req, res, { allowMethods: ["POST", "OPTIONS"], allowWildcardOrigin: false })) return;
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });
  if (typeof req.query.id !== "string" || !req.body ||
    Object.keys(req.body).length !== 1 || typeof req.body.txHash !== "string") {
    return res.status(400).json({ message: "Expected only a transaction hash" });
  }
  try {
    await dbConnect();
    const transfer = await service.recoverFreezeBurn(req.query.id, req.body.txHash, getTransferWriteTokens(req));
    return res.status(200).json(transfer);
  } catch (error) {
    const status = error instanceof TransferWriteUnauthorizedError ? 401
      : error instanceof TransferNotFoundError ? 404
      : error instanceof TransferWriteConflictError ? 409
      : error instanceof TransferValidationError ? 400 : 500;
    return res.status(status).json({ message: status === 500 ? "Unable to recover transfer" : (error as Error).message });
  }
}
