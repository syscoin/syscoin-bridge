import { RELAY_CONTRACT_ADDRESS } from "@constants";
import relayAbi from "@contexts/Transfer/relay-abi";
import SponsorWalletService from "api/services/sponsor-wallet";
import { TransferService } from "api/services/transfer";
import { getProof } from "bitcoin-proof";
import { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import { SPVProof } from "syscoinjs-lib";
import Web3 from "web3";

const web3 = new Web3(process.env.NEVM_RPC_URL ?? "https://rpc.syscoin.org");

const relayContract = new web3.eth.Contract(relayAbi, RELAY_CONTRACT_ADDRESS);

const transferService = new TransferService();

const handler: NextApiHandler = async (
  req: NextApiRequest,
  res: NextApiResponse
) => {
  const { id } = req.query;

  try {
    if (process.env.FOUNDATION_FUNDED !== "true") {
      throw new Error("Foundation funding is not available");
    }
    const transfer = await transferService.getTransfer(id as string);
    const generatedProofLog = transfer.logs.find(
      (a) => a.status === "generate-proofs"
    );
    if (!generatedProofLog) {
      throw new Error("Proofs not generated");
    }
    const proof = generatedProofLog.payload.data as SPVProof;
    const nevmBlock = await web3.eth.getBlock(`0x${proof.nevm_blockhash}`);
    if (!nevmBlock) {
      throw new Error("NEVM block not found: " + proof.nevm_blockhash);
    }
    const txBytes = `0x${proof.transaction}`;
    const txIndex = proof.index;
    const merkleProof = getProof(proof.siblings, txIndex);
    merkleProof.sibling = merkleProof.sibling.map((sibling) => `0x${sibling}`);
    const syscoinBlockheader = `0x${proof.header}`;

    const method = relayContract.methods.relayTx(
      nevmBlock.number,
      txBytes,
      txIndex,
      merkleProof.sibling,
      syscoinBlockheader
    );

    const encoded = method.encodeABI();

    const sponsorWalletService = new SponsorWalletService();

    const sponsoredTransaction = await sponsorWalletService.sponsorTransaction(
      transfer.id,
      {
        to: RELAY_CONTRACT_ADDRESS,
        data: encoded,
        value: 0,
      }
    );

    res.status(200).json(sponsoredTransaction.toJSON({ versionKey: false }));
  } catch (e) {
    let message = "Unknown error";
    if (e instanceof Error) {
      message = e.message;
    }
    res.status(500).json({ message });
  }
};

export default handler;
