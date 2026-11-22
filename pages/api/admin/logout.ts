import { withSessionRoute } from "lib/session";
import { NextApiHandler } from "next";
import { applyApiCors } from "utils/api/cors";
import { getAdminOrigin } from "utils/api/admin-authorization";

export const adminLogoutRequest: NextApiHandler = async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (applyApiCors(req, res, { allowCredentials: true, allowMethods: ["POST"] })) {
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  if (!getAdminOrigin(req)) {
    return res.status(403).json({ message: "Origin required" });
  }

  req.session.destroy();
  res.send({ ok: true });
};

export default withSessionRoute(adminLogoutRequest);
