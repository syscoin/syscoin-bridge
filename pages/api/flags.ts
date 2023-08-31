import { NextApiRequest, NextApiResponse } from "next";

function handler(req: NextApiRequest, res: NextApiResponse) {
  const foundationFundingAvailable = process.env.FOUNDATION_FUNDED === "true";
  return res.status(200).json({ foundationFundingAvailable });
}

export default handler;
