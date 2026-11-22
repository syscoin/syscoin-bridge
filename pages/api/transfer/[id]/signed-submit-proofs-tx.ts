import { RELAY_CONTRACT_ADDRESS } from "@constants";
import relayAbi from "@contexts/Transfer/relay-abi";
import SponsorWalletService, {
  SponsorNonceRecoveryError,
  SponsorshipInProgressError,
} from "api/services/sponsor-wallet";
import {
  assertSponsoredProofBurn,
  getCanonicalProof,
  getSponsoredProofMinimum,
} from "api/services/sponsor-proof";
import {
  TransferNotFoundError,
  TransferService,
  TransferWriteUnauthorizedError,
} from "api/services/transfer";
import { TransferValidationError } from "api/services/transfer-validation";
import { getProof } from "bitcoin-proof";
import dbConnect from "lib/mongodb";
import { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import { SPVProof } from "syscoinjs-lib";
import Web3 from "web3";
import { applyApiCors } from "utils/api/cors";
import { getTransferWriteTokens } from "utils/api/transfer-write-capability";
import { syscoinTxIdFromWitnessStrippedHex } from "utils/syscoin-txid";
import {
  assertProofBlockIsHistorical,
  ProofBlockPendingError,
  ProofSponsorshipUnavailableError,
} from "utils/proof-submission";

const web3 = new Web3(process.env.NEVM_RPC_URL ?? "https://rpc.syscoin.org");

const relayContract = new web3.eth.Contract(relayAbi, RELAY_CONTRACT_ADDRESS);

const transferService = new TransferService();
const sponsorWalletService = new SponsorWalletService();

const handler: NextApiHandler = async (
  req: NextApiRequest,
  res: NextApiResponse
) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (applyApiCors(req, res, { allowMethods: ["POST", "OPTIONS"] })) {
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { id } = req.query;
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    return res.status(400).json({ message: "Invalid transfer ID" });
  }
  const writeTokens = getTransferWriteTokens(req);
  if (writeTokens.length === 0) {
    return res.status(401).json({ message: "Transfer write is not authorized" });
  }

  try {
    if (process.env.FOUNDATION_FUNDED !== "true") {
      throw new ProofSponsorshipUnavailableError("Foundation funding is not available");
    }
    await dbConnect();
    const transfer = await transferService.getAuthorizedTransfer(id, writeTokens);
    if (transfer.version !== "v2" || transfer.type !== "sys-to-nevm") {
      throw new Error("Foundation proof sponsorship is only available for V2 SYS to NEVM transfers");
    }
    const generatedProofLog = transfer.logs.find(
      (a) => a.status === "generate-proofs"
    );
    if (!generatedProofLog) {
      throw new Error("Proofs not generated");
    }
    const submittedProof = generatedProofLog.payload.data as SPVProof;
    const sourceTxHash = syscoinTxIdFromWitnessStrippedHex(submittedProof.transaction);
    const existing = await sponsorWalletService.getExistingProofSponsorship(
      transfer.id,
      sourceTxHash
    );
    if (existing) {
      return res.status(200).json({
        status: existing.status,
        transaction: {
          hash: existing.transaction.hash,
          confirmedHash: existing.transaction.confirmedHash,
        },
      });
    }

    const minimum = getSponsoredProofMinimum();
    const { proof } = await getCanonicalProof(submittedProof);
    assertSponsoredProofBurn(transfer, proof, minimum);
    const nevmBlock = await web3.eth.getBlock(`0x${proof.nevm_blockhash}`);
    if (!nevmBlock) {
      throw new Error("NEVM block not found: " + proof.nevm_blockhash);
    }
    if (nevmBlock.number === null) {
      throw new Error("NEVM proof block has no block number");
    }
    assertProofBlockIsHistorical(
      nevmBlock.number,
      await web3.eth.getBlockNumber()
    );
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
    if (e instanceof TransferWriteUnauthorizedError) {
      return res.status(401).json({ message: e.message });
    }
    if (e instanceof TransferNotFoundError) {
      return res.status(404).json({ message: e.message });
    }
    if (e instanceof TransferValidationError) {
      return res.status(400).json({ message: e.message });
    }
    if (e instanceof ProofSponsorshipUnavailableError) {
      return res.status(422).json({ code: e.code, message: e.message });
    }
    let message = "Unknown error";
    if (e instanceof Error) {
      message = e.message;
    }
    const status =
      e instanceof ProofBlockPendingError ||
      e instanceof SponsorshipInProgressError
        ? 409
        : e instanceof SponsorNonceRecoveryError
          ? 503
          : 500;
    if (e instanceof ProofBlockPendingError) {
      res.setHeader("Retry-After", e.retryAfterMs / 1_000);
      return res.status(status).json({
        code: e.code,
        message,
        retryAfterMs: e.retryAfterMs,
      });
    }
    res.status(status).json({ message });
  }
};

export default handler;
