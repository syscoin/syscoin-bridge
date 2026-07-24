import { ERC20_MANAGER_CONTRACT_ADDRESS, MIN_AMOUNT } from "@constants";
import { SYSX_ASSET_GUID } from "@contexts/Transfer/constants";
import SyscoinERC20ManagerABI from "@contexts/Transfer/abi/SyscoinERC20Manager";
import { ETH_TO_SYS_TRANSFER_STATUS } from "@contexts/Transfer/types";
import SponsorWalletService from "api/services/sponsor-wallet";
import { TransferService } from "api/services/transfer";
import dbConnect from "lib/mongodb";
import SponsorRateLimit from "models/sponsor-rate-limit";
import { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import satoshibitcoin from "satoshi-bitcoin";
import { applyApiCors } from "utils/api/cors";
import web3 from "utils/get-web3";
import { AbiItem, toWei } from "web3-utils";

const transferService = new TransferService();
const sponsorWalletService = new SponsorWalletService();
const DEFAULT_RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_IP_RATE_LIMIT = 20;
const DEFAULT_ADDRESS_RATE_LIMIT = 3;
const tokenFreezeAbi = SyscoinERC20ManagerABI.find(
  (item) => item.type === "event" && item.name === "TokenFreeze"
) as AbiItem | undefined;
const tokenFreezeSignature = tokenFreezeAbi
  ? web3.eth.abi.encodeEventSignature(tokenFreezeAbi)
  : undefined;
const duplicateKeyCode = 11000;

const isDuplicateKeyError = (error: unknown) => {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number }).code === duplicateKeyCode
  );
};

const getNumericEnv = (name: string, fallback: number) => {
  const parsed = Number(process.env[name]);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getClientIp = (req: NextApiRequest) => {
  if (process.env.SPONSOR_TRUST_PROXY_HEADERS === "true") {
    const realIp = req.headers["x-real-ip"];
    if (typeof realIp === "string" && realIp) {
      return realIp;
    }

    const forwardedFor = req.headers["x-forwarded-for"];
    const forwardedValue = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor;
    const forwardedIp = forwardedValue?.split(",")[0]?.trim();
    if (forwardedIp) {
      return forwardedIp;
    }
  }

  return req.socket.remoteAddress ?? "unknown";
};

const initializeRateLimit = async (
  key: string,
  resetAt: Date,
  retry = true
) => {
  try {
    await SponsorRateLimit.updateOne(
      { key },
      {
        $setOnInsert: {
          count: 0,
          resetAt,
        },
      },
      { upsert: true }
    );
  } catch (error) {
    if (retry && isDuplicateKeyError(error)) {
      await initializeRateLimit(key, resetAt, false);
      return;
    }

    throw error;
  }
};

const consumeRateLimit = async (key: string, limit: number, windowMs: number) => {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);

  await initializeRateLimit(key, resetAt);
  await SponsorRateLimit.updateOne(
    { key, resetAt: { $lte: now } },
    {
      $set: {
        count: 0,
        resetAt,
      },
    }
  );

  const result = await SponsorRateLimit.updateOne(
    { key, resetAt: { $gt: now }, count: { $lt: limit } },
    { $inc: { count: 1 } }
  );

  if (result.modifiedCount !== 1) {
    throw new Error("Sponsor claim gas rate limit exceeded");
  }
};

const normalizeAddress = (address: string) => address.toLowerCase();

const isSuccessfulReceiptStatus = (status: unknown) => {
  return status === true || status === "0x1" || status === "1" || status === 1;
};

const getTopicAddress = (topic: string) => {
  return `0x${topic.slice(-40)}`.toLowerCase();
};

const topicMatchesAssetGuid = (topic: string) => {
  try {
    return BigInt(topic).toString() === SYSX_ASSET_GUID;
  } catch {
    return false;
  }
};

const getConfirmedFreezeBurnTxHash = (
  transfer: Awaited<ReturnType<TransferService["getTransfer"]>>
) => {
  const confirmedFreezeBurn = transfer.logs.find(
    (log) =>
      log.status === ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_FREEZE_BURN_SYS &&
      Boolean(log.payload?.data?.transactionHash)
  );

  if (!confirmedFreezeBurn) {
    throw new Error("Freeze and burn must be confirmed before claim gas funding");
  }

  return confirmedFreezeBurn.payload.data.transactionHash.toLowerCase();
};

const assertClaimGasEligible = async (
  transfer: Awaited<ReturnType<TransferService["getTransfer"]>>
): Promise<string> => {
  if (transfer.version !== "v2") {
    throw new Error("Foundation sponsorship is only available for V2 transfers");
  }

  if (transfer.type !== "nevm-to-sys") {
    throw new Error("Claim gas sponsorship is only available for NEVM to SYS");
  }

  if (!transfer.utxoAddress || !transfer.nevmAddress) {
    throw new Error("Missing transfer addresses");
  }

  if (Number(transfer.amount) < MIN_AMOUNT) {
    throw new Error("Transfer amount is below the bridge minimum");
  }

  if (!ERC20_MANAGER_CONTRACT_ADDRESS) {
    throw new Error("ERC20 manager contract is not configured");
  }

  if (!tokenFreezeAbi || !tokenFreezeSignature) {
    throw new Error("TokenFreeze event ABI is not configured");
  }

  const amountWei = toWei(transfer.amount.toString(), "ether");
  const amountSats = Math.ceil(
    satoshibitcoin.toSatoshi(transfer.amount.toString())
  ).toString();
  const transactionHash = getConfirmedFreezeBurnTxHash(transfer);
  const [transaction, receipt] = await Promise.all([
    web3.eth.getTransaction(transactionHash),
    web3.eth.getTransactionReceipt(transactionHash),
  ]);

  if (!transaction || !receipt) {
    throw new Error("Freeze and burn transaction was not found on NEVM");
  }

  const managerAddress = normalizeAddress(ERC20_MANAGER_CONTRACT_ADDRESS);
  const nevmAddress = normalizeAddress(transfer.nevmAddress);

  if (
    !transaction.to ||
    normalizeAddress(transaction.to) !== managerAddress ||
    normalizeAddress(transaction.from) !== nevmAddress ||
    transaction.value !== amountWei
  ) {
    throw new Error("Freeze and burn transaction does not match this transfer");
  }

  if (
    !isSuccessfulReceiptStatus(receipt.status) ||
    !receipt.to ||
    normalizeAddress(receipt.to) !== managerAddress
  ) {
    throw new Error("Freeze and burn transaction was not successful");
  }

  const tokenFreezeLog = receipt.logs.find((log) => {
    if (
      !log.address ||
      log.topics.length < 3 ||
      normalizeAddress(log.address) !== managerAddress ||
      log.topics[0] !== tokenFreezeSignature ||
      !topicMatchesAssetGuid(log.topics[1]) ||
      getTopicAddress(log.topics[2]) !== nevmAddress
    ) {
      return false;
    }

    const decoded = web3.eth.abi.decodeLog(
      tokenFreezeAbi.inputs?.filter((input) => !input.indexed) ?? [],
      log.data,
      []
    ) as { satoshiValue?: string; syscoinAddr?: string };

    return (
      decoded.satoshiValue?.toString() === amountSats &&
      decoded.syscoinAddr === transfer.utxoAddress
    );
  });

  if (!tokenFreezeLog) {
    throw new Error("Freeze and burn event does not match this transfer");
  }

  return transactionHash;
};

const applySponsorRateLimits = async (
  req: NextApiRequest,
  transfer: Awaited<ReturnType<TransferService["getTransfer"]>>
) => {
  const windowMs = getNumericEnv(
    "SPONSOR_RATE_LIMIT_WINDOW_MS",
    DEFAULT_RATE_LIMIT_WINDOW_MS
  );
  const ipLimit = getNumericEnv("SPONSOR_IP_RATE_LIMIT", DEFAULT_IP_RATE_LIMIT);
  const addressLimit = getNumericEnv(
    "SPONSOR_ADDRESS_RATE_LIMIT",
    DEFAULT_ADDRESS_RATE_LIMIT
  );

  await consumeRateLimit(`claim-gas:ip:${getClientIp(req)}`, ipLimit, windowMs);
  await consumeRateLimit(
    `claim-gas:utxo:${transfer.utxoAddress}`,
    addressLimit,
    windowMs
  );
  await consumeRateLimit(
    `claim-gas:nevm:${transfer.nevmAddress?.toLowerCase()}`,
    addressLimit,
    windowMs
  );
};

const handler: NextApiHandler = async (
  req: NextApiRequest,
  res: NextApiResponse
) => {
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

  try {
    if (process.env.FOUNDATION_FUNDED !== "true") {
      throw new Error("Foundation funding is not available");
    }

    await dbConnect();

    const transfer = await transferService.getTransfer(id);
    const freezeBurnTxHash = await assertClaimGasEligible(transfer);

    const preflightResult =
      await sponsorWalletService.getUtxoClaimGasFundingStatus(
        transfer,
        freezeBurnTxHash
      );
    if (preflightResult) {
      return res.status(200).json(preflightResult);
    }

    await applySponsorRateLimits(req, transfer);
    const result = await sponsorWalletService.sponsorUtxoClaimGas(
      transfer,
      freezeBurnTxHash
    );

    return res.status(200).json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";

    return res.status(500).json({ message });
  }
};

export default handler;
