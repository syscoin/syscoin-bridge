import { NextApiRequest, NextApiResponse } from "next";
import { applyApiCors } from "utils/api/cors";
import {
  isSyscoinTestnetHost,
  resolveSyscoinIsTestnet,
} from "utils/network-config";
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

  const chainId = process.env.CHAIN_ID || process.env.NEXT_PUBLIC_CHAIN_ID;
  const configuredIsTestnet =
    process.env.IS_TESTNET ?? process.env.NEXT_PUBLIC_IS_TESTNET;
  const isTestnet = resolveSyscoinIsTestnet({
    chain_id: chainId,
    isTestnet:
      configuredIsTestnet === "true" ||
      (configuredIsTestnet === undefined &&
        isSyscoinTestnetHost(req.headers.host)),
  });

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
    isTestnet,
    chain_id: chainId,
  });
}

export default handler;
