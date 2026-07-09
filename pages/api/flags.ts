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
