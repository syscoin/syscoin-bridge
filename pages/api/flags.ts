import { NextApiRequest, NextApiResponse } from "next";

function handler(req: NextApiRequest, res: NextApiResponse) {
  const foundationFundingAvailable = process.env.FOUNDATION_FUNDED === "true";
  const adminEnabled = process.env.ADMIN_API_KEY !== undefined;
  return res.status(200).json({ foundationFundingAvailable, adminEnabled });
}

export default handler;
