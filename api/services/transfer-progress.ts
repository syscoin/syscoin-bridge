import { ERC20_MANAGER_CONTRACT_ADDRESS, RELAY_CONTRACT_ADDRESS } from "@constants";
import managerAbi from "@contexts/Transfer/abi/SyscoinERC20Manager";
import { SYSX_ASSET_GUID } from "@contexts/Transfer/constants";
import relayAbi from "@contexts/Transfer/relay-abi";
import { COMMON_STATUS, ITransfer, ITransferLog, TransferStatus } from "@contexts/Transfer/types";
import { isDeepStrictEqual } from "util";
import { SPVProof, utils as syscoinUtils } from "syscoinjs-lib";
import web3 from "utils/get-web3";
import { toSyscoinBaseUnits } from "utils/syscoin-amount";
import { syscoinTxIdFromWitnessStrippedHex } from "utils/syscoin-txid";
import { AbiItem, toWei } from "web3-utils";
import {
  assertAccountInputs, assertAccountSysxInputs, blockbookUrl,
  encodedTransactionIndex, requireEvidence, UtxoTransaction,
} from "./transfer-completion";
import { getCanonicalProof } from "./sponsor-proof";
import { assertFreezeBurnMatchesTransfer } from "./sponsor-utxo-eligibility";
import { TransferValidationError } from "./transfer-validation";

type Allocation = { assetGuid: string; values: { n: number; value: { toString(): string } }[] };
const { getAllocationsFromTx, bufferUtils } = require("syscointx-js") as {
  getAllocationsFromTx: (transaction: any) => Allocation[] | null;
  bufferUtils: {
    deserializeAllocationBurn: (payload: Buffer, extractMemo: boolean) => {
      allocation: Allocation[]; ethaddress: Buffer;
    };
    deserializeMintSyscoin: (payload: Buffer) => {
      allocation: Allocation[]; blockhash: Buffer; txpath: Buffer;
    };
  };
};

const sameAddress = (left?: string | null, right?: string | null) =>
  Boolean(left && right && left.toLowerCase() === right.toLowerCase());
const isHash = (hash: unknown, nevm = false): hash is string =>
  typeof hash === "string" && (nevm ? /^0x[a-f0-9]{64}$/i : /^[a-f0-9]{64}$/i).test(hash);
const isErrorLog = (log: ITransferLog) =>
  Object.keys(log.payload.data).length === 1 && "error" in log.payload.data;
const usesSysx = (transfer: ITransfer) => Boolean(transfer.useSysx || transfer.utxoAssetType === "sysx");
const legacyFreezeAbi: AbiItem = {
  type: "function", name: "freezeBurnERC20", inputs: [
    { name: "value", type: "uint256" },
    { name: "assetGuid", type: "uint64" },
    { name: "syscoinAddr", type: "string" },
  ],
};

const routeSteps = (transfer: ITransfer): string[] => transfer.type === "sys-to-nevm"
  ? [...(usesSysx(transfer) ? [] : ["burn-sys", "confirm-burn-sys"]),
    "burn-sysx", "confirm-burn-sysx", "generate-proofs", "submit-proofs", "finalizing", "completed"]
  : ["freeze-burn-sys", "confirm-freeze-burn-sys", "mint-sysx", "confirm-mint-sysx",
    "burn-sysx", "confirm-burn-sysx", "finalizing", "completed"];

const stepForStatus = (transfer: ITransfer, status: string) => status === "switch"
  ? (transfer.type === "sys-to-nevm" ? "submit-proofs" : "mint-sysx") : status;

// A recorded successful submission must never expose its signing control again.
// Diagnostic errors do not move this lower bound; canonical confirmation logs do.
const logProgressFloor = (transfer: ITransfer) => {
  const steps = routeSteps(transfer);
  return transfer.logs.reduce((floor, log) => {
    if (isErrorLog(log)) return floor;
    const data = log.payload.data;
    let stage: string | undefined;
    if (["burn-sys", "mint-sysx", "burn-sysx"].includes(log.status) && (data.tx || data.txid)) {
      stage = data.txid
        ? (log.status === "burn-sys" || log.status === "mint-sysx" ? "burn-sysx"
          : transfer.type === "sys-to-nevm" ? "generate-proofs" : "finalizing")
        : `confirm-${log.status}`;
    } else if (log.status === "freeze-burn-sys" && data.hash) stage = "confirm-freeze-burn-sys";
    else if (log.status === "confirm-freeze-burn-sys" && data.transactionHash) stage = "mint-sysx";
    else if (log.status === "generate-proofs" && data.transaction) stage = "submit-proofs";
    else if (log.status === "submit-proofs" && data.hash) stage = "finalizing";
    else if (log.status === "finalizing" && data.transactionHash) stage = "finalizing";
    return Math.max(floor, stage ? steps.indexOf(stage) : -1);
  }, 0);
};

/** Server-owned high-water mark; only call after validating the same progress. */
export const verifiedTransferProgressStatus = (
  transfer: ITransfer, existing?: ITransfer
): TransferStatus => {
  const steps = routeSteps(transfer);
  const index = Math.max(logProgressFloor(transfer),
    steps.indexOf(stepForStatus(transfer, transfer.status)),
    existing ? steps.indexOf(stepForStatus(existing, existing.status)) : -1);
  return steps[index] as TransferStatus;
};

// Chain payloads are refreshed from trusted providers. Compare their stable
// identity, not changing confirmation counts, object key order or Mongo log IDs.
const logIdentity = (log: ITransferLog) => {
  const data = log.payload.data;
  const chainReference = data.tx ?? data.txid ?? data.hash ?? data.transactionHash ??
    (log.status === "generate-proofs" && typeof data.transaction === "string"
      ? syscoinTxIdFromWitnessStrippedHex(data.transaction) : undefined);
  return {
    status: log.status, date: log.date, message: log.payload.message,
    previousStatus: log.payload.previousStatus,
    data: chainReference ? String(chainReference).toLowerCase() : data,
  };
};

const assertHistory = (transfer: ITransfer, existing?: ITransfer) => {
  if (!existing) return;
  requireEvidence(transfer.logs.length >= existing.logs.length, "Transfer history cannot be removed");
  existing.logs.forEach((log, index) => requireEvidence(
    isDeepStrictEqual(logIdentity(log), logIdentity(transfer.logs[index])),
    "Transfer history cannot be rewritten"
  ));
  const steps = routeSteps(transfer);
  const from = Math.max(logProgressFloor(existing), steps.indexOf(stepForStatus(existing, existing.status)));
  const to = steps.indexOf(stepForStatus(transfer, transfer.status));
  requireEvidence(transfer.status === COMMON_STATUS.ERROR || to >= from, "Transfer progress cannot move backwards");
  requireEvidence(existing.status !== COMMON_STATUS.COMPLETED || transfer.status === COMMON_STATUS.COMPLETED,
    "Completed transfers cannot be reopened");
};

/** Authorize progress from actual chain evidence, not client status/receipt claims. */
export const canonicalizeTransferProgress = async (
  transfer: ITransfer, existing?: ITransfer
): Promise<ITransfer> => {
  try {
    assertHistory(transfer, existing);
    const steps = routeSteps(transfer);
    requireEvidence(steps.includes(transfer.status) || transfer.status === COMMON_STATUS.ERROR ||
      transfer.status === "switch", "Invalid transfer progress");
    requireEvidence(transfer.status === COMMON_STATUS.ERROR ||
      steps.indexOf(stepForStatus(transfer, transfer.status)) >= logProgressFloor(transfer),
    "Transfer progress cannot return to an already submitted transaction");
    const refs = new Map<string, string>();
    const addReference = (stage: string, value: unknown, nevm = false) => {
      requireEvidence(isHash(value, nevm), `Invalid ${stage} transaction`);
      const hash = (value as string).toLowerCase();
      requireEvidence(!refs.has(stage) || refs.get(stage) === hash, `Conflicting ${stage} transactions`);
      refs.set(stage, hash);
    };
    for (const log of transfer.logs) {
      const data = log.payload.data;
      if (isErrorLog(log)) {
        requireEvidence(["error", "burn-sys", "burn-sysx", "mint-sysx", "freeze-burn-sys", "submit-proofs"].includes(log.status),
          "Error diagnostics cannot impersonate confirmation or proof logs");
        continue;
      }
      if (["burn-sys", "burn-sysx", "mint-sysx"].includes(log.status)) {
        requireEvidence(steps.includes(log.status), "Transaction log does not belong to this route");
        if (data.tx !== undefined) addReference(log.status, data.tx);
        if (data.txid !== undefined) addReference(log.status, data.txid);
      } else if (log.status === "freeze-burn-sys" || log.status === "submit-proofs") {
        requireEvidence(steps.includes(log.status), "Transaction log does not belong to this route");
        addReference(log.status, data.hash, true);
      } else if (log.status === "confirm-freeze-burn-sys") {
        requireEvidence(transfer.type === "nevm-to-sys", "Receipt does not belong to this route");
        addReference("freeze-burn-sys", data.transactionHash, true);
      } else if (log.status === "finalizing" && transfer.type === "sys-to-nevm") {
        addReference("submit-proofs", data.transactionHash, true);
      }
    }
    const reference = (stage: string) => {
      const hash = refs.get(stage);
      const field = stage === "freeze-burn-sys" || stage === "submit-proofs" ? "hash" : "tx";
      requireEvidence(hash && transfer.logs.some((log) => log.status === stage &&
        typeof log.payload.data[field] === "string" && log.payload.data[field].toLowerCase() === hash),
      `Missing ${stage} transaction`);
      return hash!;
    };
    const amount = toSyscoinBaseUnits(transfer.amount);
    const rawTransactions = new Map<string, Promise<UtxoTransaction>>();
    const validatedTransactions = new Map<string, Promise<UtxoTransaction>>();
    const nevmTransactions = new Map<string, ReturnType<typeof web3.eth.getTransaction>>();
    const nevmReceipts = new Map<string, ReturnType<typeof web3.eth.getTransactionReceipt>>();
    const getNevmTransaction = (hash: string) => {
      if (!nevmTransactions.has(hash)) nevmTransactions.set(hash, web3.eth.getTransaction(hash));
      return nevmTransactions.get(hash)!;
    };
    const getReceipt = (hash: string) => {
      if (!nevmReceipts.has(hash)) nevmReceipts.set(hash, web3.eth.getTransactionReceipt(hash));
      return nevmReceipts.get(hash)!;
    };
    let confirmedFreeze: Promise<any> | undefined;
    const freezeReceipt = () => confirmedFreeze ??= (async () => {
      const hash = reference("freeze-burn-sys");
      requireEvidence(transfer.logs.some((log) => log.status === "confirm-freeze-burn-sys" && !isErrorLog(log)),
        "Freeze and burn must be confirmed before minting SYSX");
      await assertFreezeBurnMatchesTransfer(transfer);
      const receipt = await getReceipt(hash);
      requireEvidence(receipt && sameAddress(receipt.transactionHash, hash), "Freeze receipt does not match this transaction");
      return receipt;
    })();

    const utxoTransaction = async (stage: string, confirmations = 0): Promise<UtxoTransaction> => {
      const hash = reference(stage);
      if (!validatedTransactions.has(stage)) validatedTransactions.set(stage, (async () => {
        if (!rawTransactions.has(hash)) rawTransactions.set(hash,
          syscoinUtils.fetchBackendRawTx(blockbookUrl(), hash) as unknown as Promise<UtxoTransaction>);
        const tx = await rawTransactions.get(hash)!;
        requireEvidence(tx && tx.txid?.toLowerCase() === hash && Number.isSafeInteger(tx.confirmations) &&
          tx.confirmations >= 0 && Array.isArray(tx.vin) && Array.isArray(tx.vout) && typeof tx.hex === "string",
        "Transfer transaction is not available on Syscoin; retry saving once it propagates");
        const raw = syscoinUtils.bitcoinjs.Transaction.fromHex(tx.hex);
        requireEvidence(raw.getId().toLowerCase() === hash, "Syscoin transaction bytes do not match its ID");
        const opReturnIndex = raw.outs.findIndex((output: { script: Uint8Array }) =>
          syscoinUtils.bitcoinjs.script.decompile(output.script)?.[0] === 0x6a);
        const payload = opReturnIndex >= 0
          ? syscoinUtils.bitcoinjs.script.decompile(raw.outs[opReturnIndex].script)?.[1] : undefined;
        requireEvidence(payload instanceof Uint8Array, "Syscoin transfer payload is missing");
        const sysxAmount = (allocations?: Allocation[] | null, outputIndex?: number) =>
          allocations?.some((allocation) => String(allocation.assetGuid) === SYSX_ASSET_GUID &&
            allocation.values.some((value) => value.value.toString() === amount &&
              (outputIndex === undefined || value.n === outputIndex)));
        if (stage === "burn-sys") {
          requireEvidence(raw.version === 139 && tx.tokenType === "SPTSyscoinBurnToAssetAllocation", "Not a SYS to SYSX conversion");
          const destination = syscoinUtils.bitcoinjs.address.toOutputScript(transfer.utxoAddress!,
            process.env.IS_TESTNET === "true" ? syscoinUtils.syscoinNetworks.testnet : syscoinUtils.syscoinNetworks.mainnet);
          requireEvidence(getAllocationsFromTx(raw)?.some((allocation) => String(allocation.assetGuid) === SYSX_ASSET_GUID &&
            allocation.values.some((value) => value.value.toString() === amount && raw.outs[value.n] &&
              Buffer.from(raw.outs[value.n].script).equals(Uint8Array.from(destination)))) &&
            raw.outs[opReturnIndex].value.toString() === amount,
          "SYS conversion does not match this transfer's recipient and amount");
          await assertAccountInputs(transfer, tx.vin);
        } else if (stage === "mint-sysx") {
          requireEvidence(transfer.type === "nevm-to-sys" && raw.version === 140 && tx.tokenType === "SPTAssetAllocationMint", "Not a SYSX mint");
          const receipt = await freezeReceipt();
          const proof = bufferUtils.deserializeMintSyscoin(Buffer.from(payload));
          requireEvidence(sameAddress(`0x${proof.blockhash.toString("hex")}`, receipt.blockHash) &&
            proof.txpath.toString("hex") === encodedTransactionIndex(receipt.transactionIndex),
          "SYSX mint does not prove this freeze-burn transaction");
          const destination = syscoinUtils.bitcoinjs.address.toOutputScript(transfer.utxoAddress!,
            process.env.IS_TESTNET === "true" ? syscoinUtils.syscoinNetworks.testnet : syscoinUtils.syscoinNetworks.mainnet);
          requireEvidence(proof.allocation?.some((allocation) => String(allocation.assetGuid) === SYSX_ASSET_GUID &&
            allocation.values.some((value) => value.value.toString() === amount && raw.outs[value.n] &&
              Buffer.from(raw.outs[value.n].script).equals(Uint8Array.from(destination)))),
          "SYSX mint does not match this transfer's recipient and amount");
        } else {
          const toNevm = transfer.type === "sys-to-nevm";
          requireEvidence(raw.version === (toNevm ? 141 : 138) && tx.tokenType ===
            (toNevm ? "SPTAssetAllocationBurnToNEVM" : "SPTAssetAllocationBurnToSyscoin"), "Not this route's SYSX burn");
          const burn = bufferUtils.deserializeAllocationBurn(Buffer.from(payload), true);
          requireEvidence(sysxAmount(burn.allocation, opReturnIndex), "SYSX burn amount does not match this transfer");
          if (toNevm) {
            requireEvidence(sameAddress(`0x${burn.ethaddress.toString("hex")}`, transfer.nevmAddress),
              "SYSX burn recipient does not match this transfer");
          } else {
            const destination = syscoinUtils.bitcoinjs.address.toOutputScript(transfer.utxoAddress!,
              process.env.IS_TESTNET === "true" ? syscoinUtils.syscoinNetworks.testnet : syscoinUtils.syscoinNetworks.mainnet);
            requireEvidence(burn.ethaddress.length === 0 && raw.outs.some((output: any) =>
              output.value.toString() === amount && Buffer.from(output.script).equals(Uint8Array.from(destination))),
            "SYSX conversion recipient does not match this transfer");
          }
          await assertAccountSysxInputs(transfer, tx);
        }
        return tx;
      })());
      const tx = await validatedTransactions.get(stage)!;
      requireEvidence(tx.confirmations >= confirmations, "Transfer transaction is not confirmed on Syscoin");
      return tx;
    };

    const freezeSubmission = async () => {
      const hash = reference("freeze-burn-sys");
      const tx = await getNevmTransaction(hash);
      requireEvidence(tx && sameAddress(tx.hash, hash) && sameAddress(tx.to, ERC20_MANAGER_CONTRACT_ADDRESS) &&
        sameAddress(tx.from, transfer.nevmAddress) && tx.value === toWei(transfer.amount, "ether"),
      "Freeze transaction is unavailable or does not match this transfer");
      const freeze = managerAbi.find((method) => method.type === "function" && method.name === "freezeBurn")!;
      if (tx.input.slice(0, 10).toLowerCase() === web3.eth.abi.encodeFunctionSignature(freeze).toLowerCase()) {
        const call = web3.eth.abi.decodeParameters(freeze.inputs!, tx.input.slice(10));
        requireEvidence(call.value === tx.value && sameAddress(call.assetAddr, "0x0000000000000000000000000000000000000000") &&
          call.tokenId === "0" && call.syscoinAddr === transfer.utxoAddress,
        "Freeze call does not match this transfer");
      } else if (tx.input.slice(0, 10).toLowerCase() === web3.eth.abi.encodeFunctionSignature(legacyFreezeAbi).toLowerCase()) {
        const call = web3.eth.abi.decodeParameters(legacyFreezeAbi.inputs!, tx.input.slice(10));
        requireEvidence(call.value === tx.value && call.assetGuid === SYSX_ASSET_GUID &&
          call.syscoinAddr === transfer.utxoAddress, "Freeze call does not match this transfer");
      } else {
        // Older manager methods remain compatible once their actual matching
        // freeze event is available; unknown pending calls are not trusted.
        await freezeReceipt();
      }
      return { hash };
    };
    let canonicalProof: Promise<SPVProof> | undefined;
    const proofData = () => canonicalProof ??= (async () => {
      const hash = reference("burn-sysx");
      await utxoTransaction("burn-sysx", 1);
      const proofs = transfer.logs.filter((log) => log.status === "generate-proofs" && !isErrorLog(log));
      requireEvidence(proofs.length > 0, "Missing generated proof");
      for (const log of proofs) requireEvidence(typeof log.payload.data.transaction === "string" &&
        syscoinTxIdFromWitnessStrippedHex(log.payload.data.transaction) === hash,
      "Generated proof does not match this transfer's source burn");
      const { proof, sourceTxHash } = await getCanonicalProof(proofs[0].payload.data as SPVProof);
      const isHex = (value: unknown) => typeof value === "string" && /^(?:[a-f0-9]{2})+$/i.test(value);
      requireEvidence(sourceTxHash === hash && isHex(proof.transaction) && isHex(proof.header) && isHex(proof.coinbase) &&
        isHash(proof.blockhash) && isHash(proof.nevm_blockhash) && Number.isSafeInteger(proof.index) && proof.index >= 0 &&
        Array.isArray(proof.siblings) && proof.siblings.every((sibling) => isHash(sibling)), "Canonical SPV proof is unavailable");
      return proof;
    })();
    const relaySubmission = async () => {
      await proofData();
      const hash = reference("submit-proofs");
      const tx = await getNevmTransaction(hash);
      const method = relayAbi.find((item) => item.name === "relayTx")!;
      requireEvidence(tx && sameAddress(tx.hash, hash) && sameAddress(tx.to, RELAY_CONTRACT_ADDRESS) &&
        tx.input.slice(0, 10).toLowerCase() === web3.eth.abi.encodeFunctionSignature(method).toLowerCase(),
      "Proof submission is unavailable or does not call the bridge relay");
      const call = web3.eth.abi.decodeParameters(method.inputs!, tx.input.slice(10));
      requireEvidence(syscoinTxIdFromWitnessStrippedHex(call._txBytes) === reference("burn-sysx"),
        "Proof submission does not match this transfer's source burn");
      return { hash };
    };

    const logs: ITransferLog[] = [];
    for (const log of transfer.logs) {
      let data = log.payload.data;
      if (!isErrorLog(log)) {
        if (["burn-sys", "burn-sysx", "mint-sysx"].includes(log.status)) {
          const isConfirmation = data.txid !== undefined;
          const confirmations = isConfirmation && log.status === "burn-sysx" ? 1 : 0;
          const tx = await utxoTransaction(log.status, confirmations);
          data = isConfirmation ? tx : { tx: tx.txid };
        } else if (log.status === "freeze-burn-sys") data = await freezeSubmission();
        else if (log.status === "confirm-freeze-burn-sys") data = await freezeReceipt();
        else if (log.status === "generate-proofs") {
          requireEvidence(transfer.type === "sys-to-nevm", "Proof does not belong to this route");
          data = await proofData();
        } else if (log.status === "submit-proofs") data = await relaySubmission();
        else if (log.status === "finalizing" && transfer.type === "sys-to-nevm") {
          await relaySubmission();
          const receipt = await getReceipt(reference("submit-proofs"));
          requireEvidence(receipt && sameAddress(receipt.transactionHash, reference("submit-proofs")) &&
            receipt.status === true && receipt.blockNumber != null && sameAddress(receipt.to, RELAY_CONTRACT_ADDRESS),
          "Proof submission is not confirmed on NEVM");
          data = receipt;
        } else if (log.status === "switch") {
          const address = transfer.type === "sys-to-nevm" ? transfer.nevmAddress : transfer.utxoAddress;
          requireEvidence(data.address === address, "Switch address does not match this transfer");
          data = { address };
        } else throw new TransferValidationError("Invalid progress log; use an error diagnostic for failed transactions");
      }
      logs.push({ ...log, payload: { ...log.payload, data } });
    }
    const result = { ...transfer, logs };
    // Each displayed step means the preceding work exists, not that the next
    // transaction has already been broadcast. Preserve both zero-conf steps.
    const stage = stepForStatus(transfer, transfer.status);
    const reached = (step: string) => steps.indexOf(stage) > steps.indexOf(step) && steps.includes(step);
    if (transfer.type === "sys-to-nevm") {
      if (reached("burn-sys")) await utxoTransaction("burn-sys");
      if (reached("burn-sysx")) await utxoTransaction("burn-sysx", reached("confirm-burn-sysx") ? 1 : 0);
      if (reached("generate-proofs")) await proofData();
      if (reached("submit-proofs")) await relaySubmission();
    } else {
      if (reached("freeze-burn-sys")) await freezeSubmission();
      if (reached("confirm-freeze-burn-sys")) await freezeReceipt();
      if (reached("mint-sysx")) await utxoTransaction("mint-sysx");
      if (reached("burn-sysx")) await utxoTransaction("burn-sysx");
    }
    return result;
  } catch (error) {
    if (error instanceof TransferValidationError) throw error;
    throw new TransferValidationError("Unable to verify transfer progress; retry saving once its transactions are available");
  }
};
