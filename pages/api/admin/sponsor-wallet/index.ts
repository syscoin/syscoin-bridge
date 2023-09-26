import { SponsorWalletService } from "api/services/sponsor-wallet";
import dbConnect from "lib/mongodb";
import { NextApiHandler } from "next";
import adminGuard from "utils/api/admin-guard";
const sponsorWalletService = new SponsorWalletService();

const handler: NextApiHandler = async (req, res) => {
  const method = req.method;

  if (method === "POST") {
    const { privateKey } = req.body;
    if (!privateKey) {
      return res.status(400).json({ message: "Missing private key" });
    }
    await dbConnect();
    sponsorWalletService
      .createSponsorWallet(privateKey)
      .then((sponsorWallet) => {
        return res.status(200).json(sponsorWallet);
      })
      .catch((error) => {
        return res.status(400).json({ message: error.message });
      });
  }
};

export default adminGuard(handler);
