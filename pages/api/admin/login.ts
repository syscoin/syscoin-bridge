import { ADMIN_LOGIN_MESSAGE } from "@constants";
import { withSessionRoute } from "lib/session";
import { NextApiHandler } from "next";
import dbConnect from "lib/mongodb";
import AdminModel from "models/admin";
import { verifySignature } from "utils/api/verify-signature";
import { applyApiCors } from "utils/api/cors";
import { normalizeAdminAddress } from "api/services/admin";

export const adminLoginRequest: NextApiHandler = async (req, res) => {
  if (applyApiCors(req, res, { allowCredentials: true })) {
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { address, signedMessage } = req.body ?? {};
  if (typeof address !== "string" || typeof signedMessage !== "string") {
    return res.status(400).json({
      success: false,
      message: "Wallet address and signature are required",
    });
  }

  const normalizedAddress = normalizeAdminAddress(address);
  let isVerified = false;
  try {
    isVerified = verifySignature(
      ADMIN_LOGIN_MESSAGE,
      signedMessage,
      normalizedAddress
    );
  } catch {
    isVerified = false;
  }

  if (!isVerified) {
    return res
      .status(401)
      .json({ success: false, message: "Wallet signature is invalid" });
  }

  await dbConnect();

  const adminUser = await AdminModel.findOne({ address: normalizedAddress });

  if (!adminUser) {
    return res.status(403).json({
      success: false,
      message: "This wallet is not registered as an administrator",
    });
  }

  req.session.user = {
    address: normalizeAdminAddress(adminUser.address),
    name: adminUser.name,
  };

  await req.session.save();
  return res.status(200).json({ success: true });
};

export default withSessionRoute(adminLoginRequest);
