import { RELAY_CONTRACT_ADDRESS } from "@constants";
import relayAbi from "@contexts/Transfer/relay-abi";
import SponsorWalletService, {
  SponsorNonceRecoveryError,
  SponsorshipInProgressError,
  syscoinTxIdFromWitnessStrippedHex,
} from "api/services/sponsor-wallet";
import { TransferService } from "api/services/transfer";
import { getProof } from "bitcoin-proof";
import dbConnect from "lib/mongodb";
import { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import { SPVProof } from "syscoinjs-lib";
import Web3 from "web3";
import { applyApiCors } from "utils/api/cors";

const web3 = new Web3(process.env.NEVM_RPC_URL ?? "https://rpc.syscoin.org");

const relayContract = new web3.eth.Contract(relayAbi, RELAY_CONTRACT_ADDRESS);

const transferService = new TransferService();

const handler: NextApiHandler = async (
  req: NextApiRequest,
  res: NextApiResponse
) => {
  if (applyApiCors(req, res)) {
    return;
  }

  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { id } = req.query;

  try {
    if (process.env.FOUNDATION_FUNDED !== "true") {
      throw new Error("Foundation funding is not available");
    }
    await dbConnect();
    const transfer = await transferService.getTransfer(id as string);
    if (transfer.version !== "v2") {
      throw new Error("Foundation sponsorship is only available for V2 transfers");
    }
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
    if (!proof.coinbase) {
      throw new Error(
        "SPV proof missing coinbase (update syscoingetspvproof / blockbook)"
      );
    }
    const txBytes = `0x${proof.transaction}`;
    const txIndex = proof.index;
    const merkleProof = getProof(proof.siblings, txIndex);
    merkleProof.sibling = merkleProof.sibling.map((sibling) => `0x${sibling}`);
    const coinbaseBytes = `0x${proof.coinbase}`;
    const coinbaseProof = getProof(proof.siblings, 0);
    coinbaseProof.sibling = coinbaseProof.sibling.map(
      (sibling) => `0x${sibling}`
    );
    const syscoinBlockheader = `0x${proof.header}`;

    const method = relayContract.methods.relayTx(
      nevmBlock.number,
      txBytes,
      txIndex,
      merkleProof.sibling,
      syscoinBlockheader,
      coinbaseBytes,
      coinbaseProof.sibling
    );

    const encoded = method.encodeABI();
    const sourceTxHash = syscoinTxIdFromWitnessStrippedHex(proof.transaction);

    const sponsorWalletService = new SponsorWalletService();

    const sponsoredTransaction = await sponsorWalletService.sponsorTransaction(
      transfer.id,
      {
        to: RELAY_CONTRACT_ADDRESS,
        data: encoded,
        value: 0,
      },
      "submit-proofs",
      sourceTxHash
    );

    res.status(200).json({
      status: sponsoredTransaction.status,
      transaction: {
        hash: sponsoredTransaction.transaction.hash,
        confirmedHash: sponsoredTransaction.transaction.confirmedHash,
      },
    });
  } catch (e) {
    let message = "Unknown error";
    if (e instanceof Error) {
      message = e.message;
    }
    const status =
      e instanceof SponsorshipInProgressError
        ? 409
        : e instanceof SponsorNonceRecoveryError
          ? 503
          : 500;
    res.status(status).json({ message });
  }
};

export default handler;
