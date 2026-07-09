import { NextApiHandler } from "next";
import { applyApiCors } from "utils/api/cors";

const apiKey = process.env.ADMIN_API_KEY;

const adminGuard = (handler: NextApiHandler) => {
  const checkHandler: NextApiHandler = (req, res) => {
    if (applyApiCors(req, res)) {
      return;
    }

    const { authorization } = req.headers;
    if (
      !authorization ||
      apiKey === undefined ||
      authorization.replace("Bearer ", "") !== apiKey.trim()
    ) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    return handler(req, res);
  };
  return checkHandler;
};

export default adminGuard;
