import type { NextApiRequest, NextApiResponse } from "next";
import {
  TransferNotFoundError,
  TransferService,
  TransferWriteUnauthorizedError,
} from "api/services/transfer";
import dbConnect from "lib/mongodb";
import { applyApiCors } from "utils/api/cors";

const transferService = new TransferService();

export const getRequest = async (
  req: NextApiRequest,
  res: NextApiResponse
) => {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ message: "Missing id" });
  }

  try {
    const transfer = await transferService.getTransfer(id as string);
    return res.status(200).json(transfer);
  } catch (error) {
    if (error instanceof TransferNotFoundError) {
      return res.status(404).json({ message: error.message });
    }
    throw error;
  }
};

export const patchRequest = async (
  req: NextApiRequest,
  res: NextApiResponse
) => {
  const id = req.query.id as string;

  if (!id) {
    return res.status(400).json({ message: "Missing id" });
  }
  if (!req.body || req.body.id !== id) {
    return res.status(400).json({ message: "Transfer id does not match URL" });
  }

  try {
    const authorization = req.headers.authorization;
    const writeToken =
      typeof authorization === "string" &&
      authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : undefined;
    const updated = await transferService.upsertTransfer(req.body, writeToken);
    res.status(200).json(updated.transfer);
  } catch (e) {
    if (e instanceof TransferWriteUnauthorizedError) {
      return res.status(401).json({ message: e.message });
    }
    if (e instanceof Error) {
      return res.status(500).json({ message: e.message });
    } else {
      return res.status(500).json({ message: "Unknown error" });
    }
  }
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const preflightMethod = req.headers["access-control-request-method"];
  const requestedMethod = Array.isArray(preflightMethod)
    ? preflightMethod[0]
    : preflightMethod;
  const isWriteRequest =
    req.method === "PATCH" || requestedMethod?.toUpperCase() === "PATCH";

  if (
    applyApiCors(req, res, {
      allowMethods: ["GET", "PATCH", "OPTIONS"],
      allowWildcardOrigin: !isWriteRequest,
    })
  ) {
    return;
  }

  if (req.method !== "GET" && req.method !== "PATCH") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  await dbConnect();
  if (req.method === "GET") {
    await getRequest(req, res);
    return;
  }
  if (req.method === "PATCH") {
    await patchRequest(req, res);
    return;
  }
}

export default handler;
