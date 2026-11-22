import { withSessionRoute } from "lib/session";
import { NextApiHandler } from "next";
import { applyApiCors } from "utils/api/cors";
import dbConnect from "lib/mongodb";
import { AdminService } from "api/services/admin";

const admins = new AdminService();

const adminSessionGuard = (handler: NextApiHandler) => {
  const checkHandler: NextApiHandler = withSessionRoute(async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    if (applyApiCors(req, res, { allowCredentials: true })) {
      return;
    }

    const { user } = req.session;
    if (!user?.adminId || !user.sessionId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    await dbConnect();
    const admin = await admins.getAdmin(user.address);
    if (!admin || String(admin._id) !== user.adminId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    return handler(req, res);
  });
  return checkHandler;
};

export default adminSessionGuard;
