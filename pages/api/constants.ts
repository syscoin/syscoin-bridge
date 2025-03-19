import { NextApiRequest, NextApiResponse } from "next";

function handler(req: NextApiRequest, res: NextApiResponse) {
  return res.status(200).json({
    contracts: {
      relayContract: { address: process.env.RELAY_CONTRACT_ADDRESS },
      ecr20ManagerContract: { address: process.env.ERC20_MANAGER_CONTRACT_ADDRESS },
    },
  });
}

export default handler;
