import { AddLogRequestPayload } from "api/types/admin/transfer/add-log";
import { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import adminSessionGuard from "utils/api/admin-session-guard";
import { handleBurnSys } from "api/services/admin-transfer/handle-burn-sys";
import { handleBurnSysx } from "api/services/admin-transfer/handle-burn-sysx";
import { handleSubmitProofs } from "api/services/admin-transfer/handle-submit-proofs";

const AdminTransferAddLog: NextApiHandler = adminSessionGuard(
  async (req: NextApiRequest, res: NextApiResponse) => {
    const body = req.body as AddLogRequestPayload;
    const transferId = req.query.id as string;
    if (body.operation === "burn-sys") {
      return handleBurnSys(transferId, body, req, res);
    } else if (body.operation === "burn-sysx") {
      return handleBurnSysx(transferId, body, req, res);
    } else if (body.operation === "submit-proofs") {
      return handleSubmitProofs(transferId, body, req, res);
    }
    // Unsupported operation
    return res.status(400).json({ message: "Bad request" });
  }
);

export default AdminTransferAddLog;
