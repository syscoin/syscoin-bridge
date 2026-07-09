import { NextApiRequest, NextApiResponse } from "next";
import { applyApiCors } from "utils/api/cors";

function handler(req: NextApiRequest, res: NextApiResponse) {
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

  return res.status(200).json({ nevmRpcUrl: process.env.NEVM_RPC_URL });
}

export default handler;
