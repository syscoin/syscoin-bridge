import { ERC20_MANAGER_CONTRACT_ADDRESS } from "@constants";
import { SYSX_ASSET_GUID } from "@contexts/Transfer/constants";
import SyscoinERC20ManagerABI from "@contexts/Transfer/abi/SyscoinERC20Manager";
import { ETH_TO_SYS_TRANSFER_STATUS } from "@contexts/Transfer/types";
import SponsorWalletService from "api/services/sponsor-wallet";
import { TransferService } from "api/services/transfer";
import dbConnect from "lib/mongodb";
import SponsorRateLimit from "models/sponsor-rate-limit";
import { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
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

const getNumericEnv = (name: string, fallback: number) => {
  const parsed = Number(process.env[name]);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getClientIp = (req: NextApiRequest) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  const forwardedValue = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor;

  return (
    forwardedValue?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown"
  );
};

const consumeRateLimit = async (key: string, limit: number, windowMs: number) => {
  const now = Date.now();
  const resetAt = new Date(now + windowMs);
  const existing = await SponsorRateLimit.findOne({ key });

  if (!existing || existing.resetAt.getTime() <= now) {
    await SponsorRateLimit.updateOne(
      { key },
      {
        $set: {
          count: 1,
          resetAt,
        },
      },
      { upsert: true }
    );
    return;
  }

  if (existing.count >= limit) {
    throw new Error("Sponsor claim gas rate limit exceeded");
  }

  existing.count += 1;
  await existing.save();
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

  return confirmedFreezeBurn.payload.data.transactionHash;
};

const assertClaimGasEligible = async (
  transfer: Awaited<ReturnType<TransferService["getTransfer"]>>
) => {
  if (transfer.type !== "nevm-to-sys") {
    throw new Error("Claim gas sponsorship is only available for NEVM to SYS");
  }

  if (!transfer.utxoAddress || !transfer.nevmAddress) {
    throw new Error("Missing transfer addresses");
  }

  if (!ERC20_MANAGER_CONTRACT_ADDRESS) {
    throw new Error("ERC20 manager contract is not configured");
  }

  if (!tokenFreezeAbi || !tokenFreezeSignature) {
    throw new Error("TokenFreeze event ABI is not configured");
  }

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
    transaction.value !== toWei(transfer.amount.toString(), "ether")
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
    ) as { syscoinAddr?: string };

    return decoded.syscoinAddr === transfer.utxoAddress;
  });

  if (!tokenFreezeLog) {
    throw new Error("Freeze and burn event does not match this transfer");
  }
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
    await assertClaimGasEligible(transfer);
    await applySponsorRateLimits(req, transfer);
    const result = await sponsorWalletService.sponsorUtxoClaimGas(transfer);

    return res.status(200).json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";

    return res.status(500).json({ message });
  }
};

export default handler;
