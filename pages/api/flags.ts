import { NextApiRequest, NextApiResponse } from "next";

function handler(req: NextApiRequest, res: NextApiResponse) {
  const foundationFundingAvailable = process.env.FOUNDATION_FUNDED === "true";
  const adminEnabled = process.env.ADMIN_API_KEY !== undefined;
  const isSys5Enabled = process.env.SYS5_ENABLED === "true";
  return res
    .status(200)
    .json({ foundationFundingAvailable, adminEnabled, isSys5Enabled });
}

export default handler;
