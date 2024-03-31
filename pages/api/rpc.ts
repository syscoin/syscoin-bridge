import { NextApiRequest, NextApiResponse } from "next";

function handler(req: NextApiRequest, res: NextApiResponse) {
  return res.status(200).json({ nevmRpcUrl: process.env.NEVM_RPC_URL });
}

export default handler;
