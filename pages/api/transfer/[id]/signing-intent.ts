import {
  TransferNotFoundError,
  TransferService,
  TransferWriteUnauthorizedError,
} from "api/services/transfer";
import { TransferValidationError } from "api/services/transfer-validation";
import type { TransferSigningIntent } from "components/Bridge/transfer-signing-intent";
import dbConnect from "lib/mongodb";
import type { NextApiHandler } from "next";
import { getTransferWriteTokens } from "utils/api/transfer-write-capability";

const transferService = new TransferService();

const handler: NextApiHandler = async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { id } = req.query;
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return res.status(400).json({ message: "Invalid transfer ID" });
  }
  const tokens = getTransferWriteTokens(req);
  if (tokens.length === 0) {
    return res.status(401).json({ message: "Transfer write is not authorized" });
  }

  try {
    await dbConnect();
    const transfer = await transferService.getAuthorizedTransfer(id, tokens);
    const {
      amount,
      nevmAddress,
      status,
      type,
      useSysx,
      utxoAddress,
      utxoAssetType,
      utxoXpub,
    } = transfer;
    if (!nevmAddress || !utxoAddress) {
      throw new TransferValidationError("Transfer addresses are missing");
    }
    const intent: TransferSigningIntent = {
      id: transfer.id,
      amount,
      nevmAddress,
      status,
      type,
      useSysx,
      utxoAddress,
      utxoAssetType,
      utxoXpub,
    };
    return res.status(200).json(intent);
  } catch (error) {
    if (error instanceof TransferWriteUnauthorizedError) {
      return res.status(401).json({ message: error.message });
    }
    if (error instanceof TransferNotFoundError) {
      return res.status(404).json({ message: error.message });
    }
    if (error instanceof TransferValidationError) {
      return res.status(409).json({ message: error.message });
    }
    throw error;
  }
};

export default handler;
