import { ERC20_MANAGER_CONTRACT_ADDRESS, MIN_AMOUNT } from "@constants";
import { SYSX_ASSET_GUID } from "@contexts/Transfer/constants";
import SyscoinERC20ManagerABI from "@contexts/Transfer/abi/SyscoinERC20Manager";
import {
  ETH_TO_SYS_TRANSFER_STATUS,
  ITransfer,
} from "@contexts/Transfer/types";
import web3 from "utils/get-web3";
import { toSyscoinBaseUnits } from "utils/syscoin-amount";
import { AbiItem, toWei } from "web3-utils";
import { assertV2ActivationBlock } from "./sponsor-eligibility";
import { getSyscoinChainId, normalizeEvmChainId, resolveExpectedEvmChainId } from "utils/network-config";

const tokenFreezeAbi = SyscoinERC20ManagerABI.find(
  (item) => item.type === "event" && item.name === "TokenFreeze"
) as AbiItem | undefined;
const tokenFreezeSignature = tokenFreezeAbi
  ? web3.eth.abi.encodeEventSignature(tokenFreezeAbi)
  : undefined;

const normalizeAddress = (address: string) => address.toLowerCase();
const getTopicAddress = (topic: string) =>
  `0x${topic.slice(-40)}`.toLowerCase();

const topicMatchesAssetGuid = (topic: string) => {
  try {
    return BigInt(topic).toString() === SYSX_ASSET_GUID;
  } catch {
    return false;
  }
};

const isSuccessfulReceiptStatus = (status: unknown) =>
  status === true || status === "0x1" || status === "1" || status === 1;

export const assertSponsoredUtxoTransfer = (transfer: ITransfer) => {
  if (transfer.version !== "v2") {
    throw new Error("UTXO sponsorship is only available for V2 transfers");
  }
  if (!transfer.utxoAddress || !transfer.utxoXpub || !transfer.nevmAddress) {
    throw new Error("Missing transfer addresses");
  }
  const amountBaseUnits = BigInt(toSyscoinBaseUnits(transfer.amount));
  const minimumBaseUnits = BigInt(toSyscoinBaseUnits(MIN_AMOUNT.toString()));
  if (amountBaseUnits < minimumBaseUnits) {
    throw new Error("Transfer amount is below the bridge minimum");
  }
};

export const assertFreezeBurnMatchesTransfer = async (
  transfer: ITransfer
): Promise<{ blockNumber: number; transactionHash: string }> => {
  const confirmedFreezeBurn = transfer.logs.find(
    (log) =>
      log.status === ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_FREEZE_BURN_SYS &&
      Boolean(log.payload?.data?.transactionHash)
  );
  if (!confirmedFreezeBurn) {
    throw new Error("Freeze and burn must be confirmed before minting SYSX");
  }
  const receipt = await getVerifiedFreezeBurnReceipt(
    transfer, String(confirmedFreezeBurn.payload.data.transactionHash)
  );
  return { blockNumber: receipt.blockNumber, transactionHash: receipt.transactionHash.toLowerCase() };
};

/** Read only the configured chain; never trust a caller-supplied receipt or RPC. */
export const getVerifiedFreezeBurnReceipt = async (
  transfer: ITransfer, suppliedHash: string
) => {
  if (transfer.type !== "nevm-to-sys") {
    throw new Error("Freeze and burn is only available for NEVM to SYS");
  }
  if (!ERC20_MANAGER_CONTRACT_ADDRESS || !tokenFreezeAbi || !tokenFreezeSignature) {
    throw new Error("ERC20 manager contract is not configured");
  }

  if (!/^0x[0-9a-f]{64}$/i.test(suppliedHash)) {
    throw new Error("Invalid freeze and burn transaction hash");
  }
  const transactionHash = suppliedHash.toLowerCase();
  const [transaction, receipt, chainId] = await Promise.all([
    web3.eth.getTransaction(transactionHash),
    web3.eth.getTransactionReceipt(transactionHash),
    web3.eth.getChainId(),
  ]);
  const expectedChain = resolveExpectedEvmChainId(
    process.env.CHAIN_ID || process.env.NEXT_PUBLIC_CHAIN_ID,
    getSyscoinChainId((process.env.IS_TESTNET ?? process.env.NEXT_PUBLIC_IS_TESTNET) === "true")
  );
  if (!expectedChain || normalizeEvmChainId(chainId) !== expectedChain) {
    throw new Error("NEVM RPC chain does not match the configured network");
  }
  if (!transaction || !receipt) {
    throw new Error("Freeze and burn transaction was not found on NEVM");
  }
  const managerAddress = normalizeAddress(ERC20_MANAGER_CONTRACT_ADDRESS);
  const nevmAddress = normalizeAddress(transfer.nevmAddress!);
  const amountWei = toWei(transfer.amount.toString(), "ether");
  if (
    transaction.hash?.toLowerCase() !== transactionHash ||
    receipt.transactionHash?.toLowerCase() !== transactionHash ||
    !/^0x[0-9a-f]{64}$/i.test(receipt.blockHash || "") ||
    transaction.blockHash?.toLowerCase() !== receipt.blockHash.toLowerCase() ||
    !Number.isSafeInteger(receipt.blockNumber) || receipt.blockNumber < 0 ||
    transaction.blockNumber !== receipt.blockNumber ||
    !Number.isSafeInteger(receipt.transactionIndex) || receipt.transactionIndex < 0 ||
    transaction.transactionIndex !== receipt.transactionIndex ||
    !transaction.to ||
    normalizeAddress(transaction.to) !== managerAddress ||
    normalizeAddress(transaction.from) !== nevmAddress ||
    transaction.value !== amountWei ||
    !isSuccessfulReceiptStatus(receipt.status) ||
    !receipt.to ||
    normalizeAddress(receipt.to) !== managerAddress
  ) {
    throw new Error("Freeze and burn transaction does not match this transfer");
  }
  const block = await web3.eth.getBlock(receipt.blockNumber, false);
  if (!block || block.number !== receipt.blockNumber ||
    block.hash?.toLowerCase() !== receipt.blockHash.toLowerCase() ||
    typeof block.transactions?.[receipt.transactionIndex] !== "string" ||
    block.transactions[receipt.transactionIndex].toLowerCase() !== transactionHash) {
    throw new Error("Freeze and burn is not included in the canonical NEVM block");
  }

  const freezeMethod = SyscoinERC20ManagerABI.find(
    (item) => item.type === "function" && item.name === "freezeBurn"
  ) as AbiItem;
  const legacyMethod: AbiItem = {
    type: "function", name: "freezeBurnERC20", inputs: [
      { name: "value", type: "uint256" }, { name: "assetGuid", type: "uint64" },
      { name: "syscoinAddr", type: "string" },
    ],
  };
  const selector = transaction.input.slice(0, 10).toLowerCase();
  const method = [freezeMethod, legacyMethod].find(
    (item) => web3.eth.abi.encodeFunctionSignature(item).toLowerCase() === selector
  );
  if (!method) throw new Error("Transaction is not a supported freeze and burn call");
  const call = web3.eth.abi.decodeParameters(method.inputs!, transaction.input.slice(10));
  if (call.value !== amountWei || call.syscoinAddr !== transfer.utxoAddress ||
    (method === freezeMethod
      ? normalizeAddress(call.assetAddr) !== "0x0000000000000000000000000000000000000000" || call.tokenId !== "0"
      : call.assetGuid !== SYSX_ASSET_GUID)) {
    throw new Error("Freeze and burn call does not match this transfer");
  }

  const amountSats = toSyscoinBaseUnits(transfer.amount);
  const matchingEvent = receipt.logs.some((log) => {
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
  if (!matchingEvent) {
    throw new Error("Freeze and burn event does not match this transfer");
  }

  return receipt;
};

export const assertSponsoredMintEligible = async (
  transfer: ITransfer
): Promise<{ blockNumber: number; transactionHash: string }> => {
  assertSponsoredUtxoTransfer(transfer);
  const source = await assertFreezeBurnMatchesTransfer(transfer);
  assertV2ActivationBlock(source.blockNumber);
  return source;
};
