import { ERC20_MANAGER_CONTRACT_ADDRESS, RELAY_CONTRACT_ADDRESS } from "@constants";
import SyscoinERC20ManagerABI from "@contexts/Transfer/abi/SyscoinERC20Manager";
import { SYSX_ASSET_GUID } from "@contexts/Transfer/constants";
import relayAbi from "@contexts/Transfer/relay-abi";
import { ITransfer } from "@contexts/Transfer/types";
import { utils as syscoinUtils } from "syscoinjs-lib";
import web3 from "utils/get-web3";
import { toSyscoinBaseUnits } from "utils/syscoin-amount";
import { syscoinTxIdFromWitnessStrippedHex } from "utils/syscoin-txid";
import { MAINNET_BLOCKBOOK_URL, resolveUtxoBlockbookUrl } from "utils/syscoin-urls";
import { assertFreezeBurnMatchesTransfer } from "./sponsor-utxo-eligibility";
import { TransferValidationError } from "./transfer-validation";

// The Syscoin decoder is the same dependency used internally by syscoinjs-lib.
const { bufferUtils } = require("syscointx-js") as {
  bufferUtils: {
    deserializeMintSyscoin: (payload: Buffer) => { blockhash: Buffer; txpath: Buffer };
  };
};

// This existing backend utility is omitted from the local syscoinjs-lib typings.
const { fetchBackendAccount } = syscoinUtils as typeof syscoinUtils & {
  fetchBackendAccount: (
    url: string, xpub: string, options: string, isXpub: boolean
  ) => Promise<{ tokens?: { type: string; name: string }[] } | undefined>;
};

type UtxoEntry = {
  txid?: string;
  vout?: number;
  n: number;
  addresses?: string[];
  value: string;
  assetInfo?: { assetGuid: string; value: string };
};
type UtxoTransaction = {
  txid: string;
  confirmations: number;
  tokenType: string;
  hex: string;
  vin: UtxoEntry[];
  vout: UtxoEntry[];
};

const requireEvidence = (valid: unknown, message: string): void => {
  if (!valid) {
    throw new TransferValidationError(message);
  }
};
const sameAddress = (left?: string | null, right?: string | null) =>
  Boolean(left && right && left.toLowerCase() === right.toLowerCase());
const successful = (status: unknown) =>
  status === true || status === 1 || status === "1" || status === "0x1";

const transactionHash = (
  transfer: ITransfer,
  status: string,
  field: "tx" | "hash"
): string => {
  const hash = transfer.logs.find(
    (log) => log.status === status && typeof log.payload?.data?.[field] === "string"
  )?.payload.data[field];
  const pattern = field === "tx" ? /^[a-f0-9]{64}$/i : /^0x[a-f0-9]{64}$/i;
  requireEvidence(typeof hash === "string" && pattern.test(hash), `Missing ${status} transaction`);
  return hash.toLowerCase();
};

const blockbookUrl = () => resolveUtxoBlockbookUrl(process.env.UTXO_RPC_URL) ??
    resolveUtxoBlockbookUrl(process.env.UTXO_EXPLORER) ?? MAINNET_BLOCKBOOK_URL;

const fetchUtxoTransaction = async (hash: string, tokenType: string) => {
  const tx = await syscoinUtils.fetchBackendRawTx(blockbookUrl(), hash) as unknown as UtxoTransaction;
  requireEvidence(
    tx && tx.txid?.toLowerCase() === hash && tx.confirmations >= 1 &&
      tx.tokenType === tokenType && Array.isArray(tx.vin) && Array.isArray(tx.vout),
    "Transfer transaction is not confirmed on Syscoin"
  );
  return tx;
};

const isSysx = (entry: UtxoEntry, amount?: string) =>
  String(entry.assetInfo?.assetGuid) === SYSX_ASSET_GUID &&
  (amount === undefined || entry.assetInfo?.value === amount);

const assertAccountSysxInputs = async (transfer: ITransfer, burn: UtxoTransaction) => {
  const inputs = burn.vin.filter((input) => isSysx(input));
  const addresses = new Set([transfer.utxoAddress]);
  const matches = () => inputs.length > 0 && inputs.every((input) =>
    input.addresses?.some((address) => addresses.has(address))
  );
  if (matches()) return;
  if (transfer.utxoXpub) {
    const account = await fetchBackendAccount(
      blockbookUrl(), transfer.utxoXpub, "details=tokens&tokens=used", true
    );
    for (const token of account?.tokens ?? []) {
      if (token.type === "XPUBAddress") addresses.add(token.name);
    }
  }
  requireEvidence(matches(), "SYSX source burn does not match the transfer account");
};

const assertSysToNevmCompleted = async (transfer: ITransfer, amount: string) => {
  const hash = transactionHash(transfer, "submit-proofs", "hash");
  const burnHash = transactionHash(transfer, "burn-sysx", "tx");
  const [receipt, transaction, burn] = await Promise.all([
    web3.eth.getTransactionReceipt(hash),
    web3.eth.getTransaction(hash),
    fetchUtxoTransaction(burnHash, "SPTAssetAllocationBurnToNEVM"),
  ]);
  requireEvidence(
    receipt && successful(receipt.status) && receipt.blockNumber != null &&
      sameAddress(receipt.to, RELAY_CONTRACT_ADDRESS) &&
      transaction && sameAddress(transaction.to, RELAY_CONTRACT_ADDRESS),
    "Proof submission is not a successful bridge transaction"
  );

  const relay = relayAbi.find((item) => item.name === "relayTx")!;
  requireEvidence(
    transaction.input.slice(0, 10).toLowerCase() ===
      web3.eth.abi.encodeFunctionSignature(relay).toLowerCase(),
    "Proof submission does not call the bridge relay"
  );
  const decoded = web3.eth.abi.decodeParameters(relay.inputs!, transaction.input.slice(10));
  requireEvidence(
    syscoinTxIdFromWitnessStrippedHex(decoded._txBytes) === burnHash,
    "Proof submission does not match the source burn"
  );
  await assertAccountSysxInputs(transfer, burn);

  const unfreeze = SyscoinERC20ManagerABI.find((item) => item.name === "TokenUnfreeze")!;
  const signature = web3.eth.abi.encodeEventSignature(unfreeze);
  const matchingEvent = receipt.logs.some((log) => {
    if (!sameAddress(log.address, ERC20_MANAGER_CONTRACT_ADDRESS) ||
      log.topics.length !== 3 || log.topics[0] !== signature) {
      return false;
    }
    const event = web3.eth.abi.decodeLog(unfreeze.inputs!, log.data, log.topics.slice(1));
    return event.assetGuid === SYSX_ASSET_GUID &&
      sameAddress(event.recipient, transfer.nevmAddress) && event.value === amount;
  });
  requireEvidence(matchingEvent, "Bridge payout does not match the transfer recipient and amount");
};

// Syscoin mint proofs contain the RLP transaction index, not the NEVM txid.
const encodedTransactionIndex = (index: number): string => {
  requireEvidence(Number.isSafeInteger(index) && index >= 0, "Invalid freeze-burn transaction index");
  if (index === 0) return "80";
  const hex = index.toString(16).padStart(Math.ceil(index.toString(16).length / 2) * 2, "0");
  return index < 128 ? hex : (128 + hex.length / 2).toString(16) + hex;
};

const assertNevmToSysCompleted = async (transfer: ITransfer, amount: string) => {
  const { transactionHash: freezeHash } = await assertFreezeBurnMatchesTransfer(transfer);
  const mintHash = transactionHash(transfer, "mint-sysx", "tx");
  const burnHash = transactionHash(transfer, "burn-sysx", "tx");
  const [receipt, mint, burn] = await Promise.all([
    web3.eth.getTransactionReceipt(freezeHash),
    fetchUtxoTransaction(mintHash, "SPTAssetAllocationMint"),
    fetchUtxoTransaction(burnHash, "SPTAssetAllocationBurnToSyscoin"),
  ]);
  const mintTransaction = syscoinUtils.bitcoinjs.Transaction.fromHex(mint.hex);
  const mintPayload = mintTransaction.outs.map((output: { script: Uint8Array }) =>
    syscoinUtils.bitcoinjs.script.decompile(output.script)
  ).find((script: unknown[]) => script?.[0] === 0x6a && script[1] instanceof Uint8Array)?.[1];
  requireEvidence(mintPayload, "SYSX mint proof is missing");
  const mintProof = bufferUtils.deserializeMintSyscoin(Buffer.from(mintPayload));
  requireEvidence(
    receipt && successful(receipt.status) && mintProof &&
      sameAddress(`0x${mintProof.blockhash.toString("hex")}`, receipt.blockHash) &&
      mintProof.txpath.toString("hex") === encodedTransactionIndex(receipt.transactionIndex),
    "SYSX mint does not prove this freeze-burn transaction"
  );
  const mintedOutputs = mint.vout.filter(
    (output) => isSysx(output, amount) && output.addresses?.includes(transfer.utxoAddress!)
  );
  requireEvidence(
    mintedOutputs.length > 0 &&
      burn.vout.some((output) => isSysx(output, amount)) &&
      burn.vout.some((output) => !output.assetInfo && output.value === amount &&
        output.addresses?.includes(transfer.utxoAddress!)),
    "SYSX conversion does not match this transfer's mint, recipient and amount"
  );
  // SYSX is fungible: wallet coin selection can consume older account outputs.
  await assertAccountSysxInputs(transfer, burn);
};

/** Client logs identify transactions only; completion is checked against the chains. */
export const assertTransferCompleted = async (transfer: ITransfer): Promise<void> => {
  if (transfer.status !== "completed") return;
  try {
    const amount = toSyscoinBaseUnits(transfer.amount);
    if (transfer.type === "sys-to-nevm") {
      await assertSysToNevmCompleted(transfer, amount);
    } else {
      await assertNevmToSysCompleted(transfer, amount);
    }
  } catch (error) {
    if (error instanceof TransferValidationError) throw error;
    throw new TransferValidationError("Unable to verify transfer completion; retry once its transactions are confirmed");
  }
};
