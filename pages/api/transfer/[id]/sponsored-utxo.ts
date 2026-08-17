import { ETH_TO_SYS_TRANSFER_STATUS } from "@contexts/Transfer/types";
import SponsorWalletService, {
  SponsorNonceRecoveryError,
  SponsorUnavailableError,
  SponsorshipInProgressError,
} from "api/services/sponsor-wallet";
import {
  assertSponsoredMintEligible,
  assertSponsoredUtxoTransfer,
} from "api/services/sponsor-utxo-eligibility";
import {
  TransferService,
  TransferWriteUnauthorizedError,
} from "api/services/transfer";
import dbConnect from "lib/mongodb";
import { NextApiHandler } from "next";
import { UTXOTransaction } from "syscoinjs-lib";
import { applyApiCors } from "utils/api/cors";
import { getTransferWriteTokens } from "utils/api/transfer-write-capability";

type SponsoredUtxoRequest = {
  action?: "mint" | "prepare-burn" | "submit-burn";
  transaction?: UTXOTransaction;
};

const transferService = new TransferService();
const sponsorWalletService = new SponsorWalletService();

const handler: NextApiHandler = async (req, res) => {
  if (applyApiCors(req, res)) {
    return;
  }
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { id } = req.query;
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ message: "Missing id" });
  }
  if (process.env.FOUNDATION_FUNDED !== "true") {
    return res.status(200).json({
      sponsored: false,
      reason: "Foundation funding is not available",
    });
  }

  try {
    await dbConnect();
    const transfer = await transferService.getAuthorizedTransfer(
      id,
      getTransferWriteTokens(req)
    );
    const { action, transaction } = req.body as SponsoredUtxoRequest;

    if (action === "mint") {
      if (transfer.status !== ETH_TO_SYS_TRANSFER_STATUS.MINT_SYSX) {
        throw new Error("Transfer is not ready to mint SYSX");
      }
      const { transactionHash } = await assertSponsoredMintEligible(transfer);
      return res
        .status(200)
        .json(
          await sponsorWalletService.sponsorUtxoMint(
            transfer,
            transactionHash
          )
        );
    }

    assertSponsoredUtxoTransfer(transfer);
    if (transfer.status !== ETH_TO_SYS_TRANSFER_STATUS.BURN_SYSX) {
      throw new Error("Transfer is not ready to burn SYSX");
    }
    if (action === "prepare-burn") {
      return res
        .status(200)
        .json(await sponsorWalletService.prepareSponsoredUtxoBurn(transfer));
    }
    if (action === "submit-burn") {
      if (!transaction?.psbt || typeof transaction.assets !== "string") {
        throw new Error("Missing Pali-signed transaction");
      }
      return res
        .status(200)
        .json(
          await sponsorWalletService.submitSponsoredUtxoBurn(
            transfer,
            transaction
          )
        );
    }

    return res.status(400).json({ message: "Invalid sponsorship action" });
  } catch (error) {
    if (error instanceof TransferWriteUnauthorizedError) {
      return res.status(401).json({ message: error.message });
    }
    if (error instanceof SponsorUnavailableError) {
      return res.status(200).json({
        sponsored: false,
        reason: error.message,
      });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    const status =
      error instanceof SponsorshipInProgressError
        ? 409
        : error instanceof SponsorNonceRecoveryError
          ? 503
          : 400;
    return res
      .status(status)
      .json({ message });
  }
};

export default handler;
