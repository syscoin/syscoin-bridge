import { NextApiRequest, NextApiResponse } from "next";
import { applyApiCors } from "utils/api/cors";
import { resolveUtxoBlockbookUrl } from "utils/syscoin-urls";

function handler(req: NextApiRequest, res: NextApiResponse) {
  if (
    applyApiCors(req, res, {
      allowMethods: ["GET", "OPTIONS"],
      allowWildcardOrigin: true,
    })
  ) {
    return;
  }

  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  return res.status(200).json({
    contracts: {
      relayContract: { address: process.env.RELAY_CONTRACT_ADDRESS },
      ecr20ManagerContract: {
        address: process.env.ERC20_MANAGER_CONTRACT_ADDRESS,
      },
    },
    rpc: {
      nevm: process.env.NEVM_RPC_URL,
      utxo: resolveUtxoBlockbookUrl(process.env.UTXO_RPC_URL),
    },
    explorer: {
      nevm: process.env.NEVM_EXPLORER,
      utxo: resolveUtxoBlockbookUrl(process.env.UTXO_EXPLORER),
    },
    apiUrl: {
      nevm: process.env.NEVM_API_URL || "",  // Only EVM networks use API URLs
      // No UTXO API URL - UTXO networks don't need separate API URLs
    },
    isTestnet: process.env.IS_TESTNET === "true",
    chain_id: process.env.CHAIN_ID,
  });
}

export default handler;
