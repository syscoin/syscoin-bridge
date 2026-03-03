import { withSessionRoute } from "lib/session";
import { NextApiHandler } from "next";
import { applyApiCors } from "utils/api/cors";

const AdminLogoutRoute: NextApiHandler = withSessionRoute(async (req, res) => {
  if (applyApiCors(req, res, { allowCredentials: true })) {
    return;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  req.session.destroy();
  res.send({ ok: true });
});

export default AdminLogoutRoute;
