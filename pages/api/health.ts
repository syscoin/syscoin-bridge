import { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "lib/mongodb";

export async function healthRequest(
  _req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    await dbConnect();
    return res.status(200).json({ message: "ok" });
  } catch (error) {
    console.error("Database health check failed", error);
    return res.status(503).json({ message: "unhealthy" });
  }
}

export default healthRequest;
