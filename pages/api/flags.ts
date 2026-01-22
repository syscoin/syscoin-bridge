import { NextApiRequest, NextApiResponse } from "next";

function handler(req: NextApiRequest, res: NextApiResponse) {
  const foundationFundingAvailable = process.env.FOUNDATION_FUNDED === "true";
  const adminEnabled = process.env.ADMIN_API_KEY !== undefined;
  const isSys5Enabled = process.env.SYS5_ENABLED !== "false";
  const isPaliV2NevmEnabled = process.env.PALI_V2_NEVM_ENABLED !== "false";
  return res
    .status(200)
    .json({
      foundationFundingAvailable,
      adminEnabled,
      isSys5Enabled,
      isPaliV2NevmEnabled,
    });
}

export default handler;
