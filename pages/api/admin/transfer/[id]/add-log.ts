import { AddLogRequestPayload } from "api/types/admin/transfer/add-log";
import { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import { authorizeAdminTransferAction, isAdminTransferId } from "utils/api/admin-authorization";
import adminSessionGuard from "utils/api/admin-session-guard";
import { handleBurnSys } from "api/services/admin-transfer/handle-burn-sys";
import { handleBurnSysx } from "api/services/admin-transfer/handle-burn-sysx";
import { handleSubmitProofs } from "api/services/admin-transfer/handle-submit-proofs";
import { handleFreezeBurn } from "api/services/admin-transfer/handle-freeze-burn";
import { handleMintSysx } from "api/services/admin-transfer/handle-mint-sysx";

const parseAddLog = (body: NextApiRequest["body"]): AddLogRequestPayload | undefined => {
  const { operation, clearAll, txId, txHash } = body ?? {};
  if (typeof clearAll !== "boolean") return undefined;
  switch (operation) {
    case "burn-sys":
    case "burn-sysx":
    case "mint-sysx":
      return typeof txId === "string" && /^[a-f0-9]{64}$/i.test(txId)
        ? { operation, clearAll, txId }
        : undefined;
    case "submit-proofs":
    case "freeze-burn-sys":
      return typeof txHash === "string" && /^0x[a-f0-9]{64}$/i.test(txHash)
        ? { operation, clearAll, txHash }
        : undefined;
    default:
      return undefined;
  }
};

const AdminTransferAddLog: NextApiHandler = adminSessionGuard(
  async (req: NextApiRequest, res: NextApiResponse) => {
    if (req.method !== "POST") {
      return res.status(405).json({ message: "Method not allowed" });
    }

    const body = parseAddLog(req.body);
    const transferId = req.query.id;
    if (!body || !isAdminTransferId(transferId)) {
      return res.status(400).json({ message: "Invalid log details or transfer ID" });
    }
    if (!(await authorizeAdminTransferAction(req, res, "add-log", transferId, body))) {
      return;
    }
    if (body.operation === "burn-sys") {
      return handleBurnSys(transferId, body, res);
    } else if (body.operation === "burn-sysx") {
      return handleBurnSysx(transferId, body, res);
    } else if (body.operation === "submit-proofs") {
      return handleSubmitProofs(transferId, body, res);
    } else if (body.operation === "freeze-burn-sys") {
      return handleFreezeBurn(transferId, body, res);
    } else if (body.operation === "mint-sysx") {
      return handleMintSysx(transferId, body, res);
    }
    // Unsupported operation
    return res.status(400).json({ message: "Bad request" });
  }
);

export default AdminTransferAddLog;
