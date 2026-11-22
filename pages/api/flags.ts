import { NextApiRequest, NextApiResponse } from "next";
import { getSponsoredProofMinimum } from "api/services/sponsor-proof";
import { applyApiCors } from "utils/api/cors";
import { ProofSponsorshipUnavailableError } from "utils/proof-submission";

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
  let proofSponsorshipMinimumBaseUnits: string | null = null;
  if (foundationFundingAvailable) {
    try {
      proofSponsorshipMinimumBaseUnits = getSponsoredProofMinimum().toString();
    } catch (error) {
      if (!(error instanceof ProofSponsorshipUnavailableError)) throw error;
    }
  }
  const adminEnabled = process.env.ADMIN_API_KEY !== undefined;
  const isSys5Enabled = process.env.SYS5_ENABLED !== "false";
  const isPaliV2NevmEnabled = process.env.PALI_V2_NEVM_ENABLED !== "false";
  return res
    .status(200)
    .json({
      foundationFundingAvailable,
      proofSponsorshipMinimumBaseUnits,
      adminEnabled,
      isSys5Enabled,
      isPaliV2NevmEnabled,
    });
}

export default handler;
