import { withSessionRoute } from "lib/session";
import { NextApiHandler } from "next";
import { applyApiCors } from "utils/api/cors";

const adminSessionGuard = (handler: NextApiHandler) => {
  const checkHandler: NextApiHandler = withSessionRoute(async (req, res) => {
    if (applyApiCors(req, res, { allowCredentials: true })) {
      return;
    }

    const { user } = req.session;
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    return handler(req, res);
  });
  return checkHandler;
};

export default adminSessionGuard;
