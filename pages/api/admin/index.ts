import { AdminService } from "api/services/admin";
import dbConnect from "lib/mongodb";
import { NextApiHandler } from "next";
import { applyApiCors } from "utils/api/cors";
import adminGuard from "utils/api/admin-guard";

const adminService = new AdminService();

interface ICreateAdminBody {
  address: string;
  name: string;
}

const isValidBody = (body: any): body is ICreateAdminBody => {
  return typeof body.address === "string" && typeof body.name === "string";
};

export const adminRequest: NextApiHandler = async (req, res) => {
  if (applyApiCors(req, res)) {
    return;
  }

  if (req.method === "GET") {
    await dbConnect();
    const { address } = req.query;
    if (!address || typeof address !== "string") {
      return res.status(400).json({ message: "Missing address" });
    }
    try {
      const admin = await adminService.getAdmin(address);
      if (admin === null) {
        return res.status(404).json({ message: "Admin not found" });
      }
      return res.status(200).json(admin);
    } catch (e) {
      if (e instanceof Error) {
        return res.status(500).json({ message: e.message });
      }
      return res.status(500).json({ message: "Unknown error" });
    }
  }

  if (req.method === "POST") {
    await dbConnect();
    const { address, name } = req.body as ICreateAdminBody;
    if (!address || !name || !isValidBody(req.body)) {
      return res.status(400).json({ message: "Missing address or name" });
    }
    return adminService
      .createAdmin(address, name)
      .then((admin) => {
        return res.status(200).json(admin);
      })
      .catch((error) => {
        return res.status(400).json({ message: error.message });
      });
  }

  return res.status(400).json({ message: "Invalid method" });
};

const guardedAdminRequest = adminGuard(adminRequest);

const handler: NextApiHandler = (req, res) => {
  if (req.method === "POST") {
    return guardedAdminRequest(req, res);
  }
  return adminRequest(req, res);
};

export default handler;
