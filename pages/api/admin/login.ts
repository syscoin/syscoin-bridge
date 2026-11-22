import { withSessionRoute } from "lib/session";
import { NextApiHandler } from "next";
import dbConnect from "lib/mongodb";
import { applyApiCors } from "utils/api/cors";
import { AdminService, normalizeAdminAddress } from "api/services/admin";
import {
  consumeAdminAuthorization,
  getAdminOrigin,
  issueAdminAuthorization,
} from "utils/api/admin-authorization";

const admins = new AdminService();

export const adminLoginRequest: NextApiHandler = async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (applyApiCors(req, res, { allowCredentials: true, allowMethods: ["POST"] })) {
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const origin = getAdminOrigin(req);
  if (!origin) return res.status(403).json({ message: "Origin required" });

  const { address, challenge, signedMessage } = req.body ?? {};
  if (typeof address !== "string" || !/^0x[\da-f]{40}$/i.test(address.trim())) {
    return res.status(400).json({
      success: false,
      message: "A valid wallet address is required",
    });
  }

  const normalizedAddress = normalizeAdminAddress(address);
  await dbConnect();
  const adminUser = await admins.getAdmin(normalizedAddress);

  if (!adminUser) {
    return res.status(403).json({
      success: false,
      message: "This wallet is not registered as an administrator",
    });
  }

  const scope = {
    origin,
    address: normalizedAddress,
    operation: "login" as const,
    // Limit a prepared challenge to this exact allowlist enrollment.
    sessionId: String(adminUser._id),
  };
  if (challenge === undefined && signedMessage === undefined) {
    return res.status(200).json(issueAdminAuthorization(scope));
  }

  const sessionId = await consumeAdminAuthorization(scope, challenge, signedMessage);
  if (!sessionId) {
    return res.status(401).json({
      success: false,
      message: "Wallet signature or login challenge is invalid or expired",
    });
  }

  req.session.user = {
    address: normalizedAddress,
    name: adminUser.name,
    adminId: String(adminUser._id),
    sessionId,
  };

  await req.session.save();
  return res.status(200).json({ success: true });
};

export default withSessionRoute(adminLoginRequest);
