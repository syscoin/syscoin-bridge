import { ERC20_MANAGER_CONTRACT_ADDRESS, MIN_AMOUNT } from "@constants";
import { SYSX_ASSET_GUID } from "@contexts/Transfer/constants";
import SyscoinERC20ManagerABI from "@contexts/Transfer/abi/SyscoinERC20Manager";
import {
  ETH_TO_SYS_TRANSFER_STATUS,
  ITransfer,
} from "@contexts/Transfer/types";
import satoshibitcoin from "satoshi-bitcoin";
import web3 from "utils/get-web3";
import { AbiItem, toWei } from "web3-utils";
import { assertV2ActivationBlock } from "./sponsor-eligibility";

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
  if (Number(transfer.amount) < MIN_AMOUNT) {
    throw new Error("Transfer amount is below the bridge minimum");
  }
};

export const assertSponsoredMintEligible = async (
  transfer: ITransfer
): Promise<{ blockNumber: number; transactionHash: string }> => {
  assertSponsoredUtxoTransfer(transfer);
  if (transfer.type !== "nevm-to-sys") {
    throw new Error("Sponsored mint is only available for NEVM to SYS");
  }
  if (!ERC20_MANAGER_CONTRACT_ADDRESS || !tokenFreezeAbi || !tokenFreezeSignature) {
    throw new Error("ERC20 manager contract is not configured");
  }

  const confirmedFreezeBurn = transfer.logs.find(
    (log) =>
      log.status === ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_FREEZE_BURN_SYS &&
      Boolean(log.payload?.data?.transactionHash)
  );
  if (!confirmedFreezeBurn) {
    throw new Error("Freeze and burn must be confirmed before minting SYSX");
  }

  const transactionHash = String(
    confirmedFreezeBurn.payload.data.transactionHash
  ).toLowerCase();
  const [transaction, receipt] = await Promise.all([
    web3.eth.getTransaction(transactionHash),
    web3.eth.getTransactionReceipt(transactionHash),
  ]);
  if (!transaction || !receipt) {
    throw new Error("Freeze and burn transaction was not found on NEVM");
  }
  assertV2ActivationBlock(receipt.blockNumber);

  const managerAddress = normalizeAddress(ERC20_MANAGER_CONTRACT_ADDRESS);
  const nevmAddress = normalizeAddress(transfer.nevmAddress!);
  const amountWei = toWei(transfer.amount.toString(), "ether");
  if (
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

  const amountSats = Math.ceil(
    satoshibitcoin.toSatoshi(transfer.amount.toString())
  ).toString();
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

  return { blockNumber: receipt.blockNumber, transactionHash };
};
