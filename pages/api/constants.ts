import { NextApiRequest, NextApiResponse } from "next";

function handler(req: NextApiRequest, res: NextApiResponse) {
  return res.status(200).json({
    contracts: {
      relayContract: { address: process.env.RELAY_CONTRACT_ADDRESS },
      ecr20ManagerContract: {
        address: process.env.ERC20_MANAGER_CONTRACT_ADDRESS,
      },
    },
    rpc: {
      nevm: process.env.NEVM_RPC_URL,
      utxo: process.env.UTXO_RPC_URL,
    },
    explorer: {
      nevm: process.env.NEVM_EXPLORER,
      utxo: process.env.UTXO_EXPLORER,
    },
    isTestnet: process.env.IS_TESTNET === "true",
    chain_id: process.env.CHAIN_ID,
  });
}

export default handler;
