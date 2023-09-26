import { NextApiHandler } from "next";

const apiKey = process.env.ADMIN_API_KEY;

const adminGuard = (handler: NextApiHandler) => {
  const checkHandler: NextApiHandler = (req, res) => {
    console.log("Auth attempt: ", {
      headers: req.headers,
      url: req.url,
      method: req.method,
      body: req.body,
      currentApiKey: apiKey,
    });
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
