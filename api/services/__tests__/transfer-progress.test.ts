import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import Web3 from "web3";
import { AbiItem } from "web3-utils";
import managerAbi from "@contexts/Transfer/abi/SyscoinERC20Manager";
import relayAbi from "@contexts/Transfer/relay-abi";
import { SYSX_ASSET_GUID } from "@contexts/Transfer/constants";
import { COMMON_STATUS, ITransfer, ITransferLog, SYS_TO_ETH_TRANSFER_STATUS } from "@contexts/Transfer/types";

const mockWeb3 = {
  eth: {
    abi: new Web3().eth.abi,
    getTransaction: jest.fn<any>(),
    getTransactionReceipt: jest.fn<any>(),
  },
};
const mockFetchRawTx = jest.fn<any>();
const mockFetchAccount = jest.fn<any>();
const mockFetchProof = jest.fn<any>();

jest.mock("@constants", () => ({
  ERC20_MANAGER_CONTRACT_ADDRESS: "0x2222222222222222222222222222222222222222",
  RELAY_CONTRACT_ADDRESS: "0x3333333333333333333333333333333333333333",
  MIN_AMOUNT: 0.1,
}));
jest.mock("utils/get-web3", () => ({ __esModule: true, default: mockWeb3 }));
jest.mock("syscoinjs-lib", () => {
  const actual = jest.requireActual<any>("syscoinjs-lib");
  return { ...actual, utils: {
    ...actual.utils,
    fetchBackendRawTx: mockFetchRawTx,
    fetchBackendAccount: mockFetchAccount,
    fetchBackendSPVProof: mockFetchProof,
  } };
});

import { canonicalizeTransferProgress, verifiedTransferProgressStatus } from "../transfer-progress";
import { encodedTransactionIndex, UtxoTransaction } from "../transfer-completion";
import { TransferValidationError } from "../transfer-validation";
import { SPVProof, utils as syscoinUtils } from "syscoinjs-lib";

// The wire encoders and Bitcoin parser are real; only trusted-provider reads are mocked.
const { bufferUtils } = require("syscointx-js");
const BN = require("bn.js");
const bitcoin = syscoinUtils.bitcoinjs;
const manager = "0x2222222222222222222222222222222222222222";
const relay = "0x3333333333333333333333333333333333333333";
const recipient = "0x1111111111111111111111111111111111111111";
const freezeHash = `0x${"c".repeat(64)}`;
const relayHash = `0x${"d".repeat(64)}`;
const blockHash = `0x${"e".repeat(64)}`;
const accountNode = bitcoin.bip32.fromSeed(Buffer.alloc(32, 1), syscoinUtils.syscoinNetworks.mainnet)
  .derivePath("m/84'/57'/0'");
const address = bitcoin.payments.p2wpkh({
  pubkey: accountNode.derive(0).derive(0).publicKey, network: syscoinUtils.syscoinNetworks.mainnet,
}).address as string;
const olderAddress = bitcoin.payments.p2wpkh({
  pubkey: accountNode.derive(0).derive(1).publicKey, network: syscoinUtils.syscoinNetworks.mainnet,
}).address as string;
const account = accountNode.neutered().toBase58() as string;
const amount = "10000000";
const assetInfo = { assetGuid: SYSX_ASSET_GUID, value: amount };

type FixtureStatus = `${ITransfer["status"]}`;
type TransferChanges = Omit<Partial<ITransfer>, "status"> & { status?: FixtureStatus };
const log = (status: FixtureStatus, data: any, date = 1): ITransferLog => ({
  status: status as ITransferLog["status"], date, payload: { message: status, data },
});
const transfer = (changes: TransferChanges = {}): ITransfer => ({
  id: "e8d6267c-f818-41b3-9ee0-09b71179c438", type: "sys-to-nevm",
  useSysx: true, amount: "0.1", createdAt: 1,
  version: "v2", agreedToTerms: true, utxoAddress: address,
  utxoXpub: account, nevmAddress: recipient, logs: [], ...changes,
  status: (changes.status ?? "burn-sysx") as ITransfer["status"],
});
const nevmTransfer = (changes: TransferChanges = {}): ITransfer => transfer({
  type: "nevm-to-sys", status: "freeze-burn-sys", useSysx: false, ...changes,
});

type WireOptions = {
  recipient?: string; amount?: string; asset?: string; version?: number;
  confirmations?: number; blockhash?: string; txpath?: string; allocationIndex?: number;
  conversionValue?: string; ethaddress?: string; sourceAddress?: string;
};
const wireTransaction = (
  stage: "burn-sys" | "burn-sysx-nevm" | "mint-sysx" | "burn-sysx-sys",
  options: WireOptions = {}
): UtxoTransaction => {
  const to = options.recipient ?? address;
  const value = options.amount ?? amount;
  const native = stage === "burn-sys";
  const mint = stage === "mint-sysx";
  const toNevm = stage === "burn-sysx-nevm";
  const allocation = [{ assetGuid: options.asset ?? SYSX_ASSET_GUID,
    values: [{ n: options.allocationIndex ?? (native || mint ? 0 : 1), value: new BN(value) }] }];
  let payload = bufferUtils.serializeAssetAllocations(allocation);
  if (mint) payload = Buffer.concat([payload, bufferUtils.serializeMintSyscoin({
    ethtxid: Buffer.from(freezeHash.slice(2), "hex"),
    blockhash: Buffer.from((options.blockhash ?? blockHash).slice(2), "hex"),
    txpos: 0, txparentnodes: Buffer.from("c0", "hex"),
    txpath: Buffer.from(options.txpath ?? "80", "hex"),
    receiptpos: 0, receiptparentnodes: Buffer.from("c0", "hex"),
    txroot: Buffer.alloc(32, 4), receiptroot: Buffer.alloc(32, 5),
  })]);
  else if (!native) payload = Buffer.concat([payload, bufferUtils.serializeAllocationBurn({
    ethaddress: Buffer.from((options.ethaddress ?? (toNevm ? recipient : "")).replace(/^0x/, ""), "hex"),
  })]);
  const raw = new bitcoin.Transaction();
  raw.version = options.version ?? (native ? 139 : mint ? 140 : toNevm ? 141 : 138);
  raw.addInput(Buffer.alloc(32, 9), 0);
  raw.addOutput(bitcoin.address.toOutputScript(to, syscoinUtils.syscoinNetworks.mainnet),
    BigInt(!native && !mint && !toNevm ? options.conversionValue ?? value : "680"));
  raw.addOutput(bitcoin.script.compile([0x6a, payload]), BigInt(native ? value : "0"));
  return {
    txid: raw.getId(), hex: raw.toHex(), confirmations: options.confirmations ?? 0,
    tokenType: native ? "SPTSyscoinBurnToAssetAllocation" : mint ? "SPTAssetAllocationMint" :
      toNevm ? "SPTAssetAllocationBurnToNEVM" : "SPTAssetAllocationBurnToSyscoin",
    vin: [{ n: 0, txid: "9".repeat(64), vout: 0, value: "680",
      addresses: [options.sourceAddress ?? address], ...(!native && !mint ? { assetInfo } : {}) }],
    vout: [
      { n: 0, value: native || mint || toNevm ? "680" : value, addresses: [to],
        ...(native || mint ? { assetInfo: { assetGuid: allocation[0].assetGuid, value } } : {}) },
      { n: 1, value: native ? value : "0", ...(!native && !mint ? { assetInfo } : {}) },
    ],
  };
};

const mixedConversionTransaction = (options: {
  recipient?: string; conversionValue?: string; laterMatchingOutput?: boolean;
} = {}): UtxoTransaction => {
  const { assetAllocationBurn, getAllocationsFromTx } = require("syscointx-js");
  const result = assetAllocationBurn(
    { ethaddress: Buffer.alloc(0) }, { rbf: true },
    { assets: new Map(), utxos: [{
      txId: "9".repeat(64), vout: 0, type: "BECH32", address,
      value: new BN("100000000"),
      assetInfo: { assetGuid: SYSX_ASSET_GUID, value: new BN("12100000") },
    }] },
    new Map([[SYSX_ASSET_GUID, {
      changeAddress: address, outputs: [{ address, value: new BN(amount) }],
    }]]), address, new BN(10)
  );
  expect(result.success).toBe(true);
  const raw = new bitcoin.Transaction();
  raw.version = result.txVersion;
  raw.addInput(Buffer.alloc(32, 9), 0);
  result.outputs.forEach((output: any, n: number) => {
    const script = output.script ?? bitcoin.address.toOutputScript(
      n === 0 ? options.recipient ?? output.address : output.address, syscoinUtils.syscoinNetworks.mainnet
    );
    raw.addOutput(script, BigInt(n === 0 ? options.conversionValue ?? output.value.toString() : output.value.toString()));
  });
  if (options.laterMatchingOutput) {
    // Use the ordinary native change output so no extra allocation or funding is introduced.
    raw.outs[raw.outs.length - 1].value = BigInt(amount);
  }
  const allocations = getAllocationsFromTx(raw);
  const vout = raw.outs.map((output: any, n: number) => {
    const allocation = allocations.find((entry: any) => entry.values.some((value: any) => value.n === n));
    const allocationValue = allocation?.values.find((value: any) => value.n === n);
    const opReturn = bitcoin.script.decompile(output.script)?.[0] === 0x6a;
    return {
      n, value: output.value.toString(), ...(opReturn ? {} : {
        addresses: [bitcoin.address.fromOutputScript(output.script, syscoinUtils.syscoinNetworks.mainnet)],
      }),
      ...(allocation ? { assetInfo: { assetGuid: allocation.assetGuid, value: allocationValue.value.toString() } } : {}),
    };
  });
  expect(vout[0].assetInfo).toEqual({ assetGuid: SYSX_ASSET_GUID, value: "2100000" });
  return {
    txid: raw.getId(), hex: raw.toHex(), tokenType: "SPTAssetAllocationBurnToSyscoin", confirmations: 1,
    vin: [{ n: 0, txid: "9".repeat(64), vout: 0, value: "100000000", addresses: [address],
      assetInfo: { assetGuid: SYSX_ASSET_GUID, value: "12100000" } }], vout,
  };
};

const freeze = (changes: Record<string, unknown> = {}) => ({
  hash: freezeHash, from: recipient, to: manager, value: "100000000000000000",
  input: mockWeb3.eth.abi.encodeFunctionCall(managerAbi.find((method) => method.name === "freezeBurn")!,
    ["100000000000000000", "0x0000000000000000000000000000000000000000", "0", address]),
  ...changes,
});
const legacyFreezeMethod: AbiItem = {
  type: "function", name: "freezeBurnERC20", stateMutability: "payable",
  inputs: [{ name: "value", type: "uint256" }, { name: "assetGuid", type: "uint64" },
    { name: "syscoinAddr", type: "string" }], outputs: [],
};
const legacyFreeze = (values = ["100000000000000000", SYSX_ASSET_GUID, address]) => freeze({
  input: mockWeb3.eth.abi.encodeFunctionCall(legacyFreezeMethod, values),
});
const freezeReceipt = (changes: Record<string, unknown> = {}) => ({
  transactionHash: freezeHash, status: true, to: manager, blockNumber: 100,
  blockHash, transactionIndex: 0,
  logs: [{ address: manager, topics: [
    mockWeb3.eth.abi.encodeEventSignature(managerAbi.find((method) => method.name === "TokenFreeze")!),
    mockWeb3.eth.abi.encodeParameter("uint64", SYSX_ASSET_GUID),
    mockWeb3.eth.abi.encodeParameter("address", recipient),
  ], data: mockWeb3.eth.abi.encodeParameters(["uint256", "string"], [amount, address]) }],
  ...changes,
});
const canonicalProof = (burn: UtxoTransaction): SPVProof => ({
  transaction: burn.hex, coinbase: "01000000", header: "01", blockhash: "a".repeat(64),
  siblings: ["b".repeat(64)], index: 0, nevm_blockhash: "e".repeat(64), chainlock: false,
});
const relaySubmission = (burn: UtxoTransaction, changes: Record<string, unknown> = {}) => ({
  hash: relayHash, from: recipient, to: relay,
  input: mockWeb3.eth.abi.encodeFunctionCall(relayAbi[0],
    ["100", `0x${burn.hex}`, "0", [], "0x01", "0x01000000", []] as any),
  ...changes,
});
const installUtxo = (...transactions: UtxoTransaction[]) => {
  const byHash = new Map(transactions.map((tx) => [tx.txid, tx]));
  mockFetchRawTx.mockImplementation(async (_url: string, hash: string) => byHash.get(hash));
};
const freezeLogs = (): ITransferLog[] => [
  log("freeze-burn-sys", { hash: freezeHash }),
  log("confirm-freeze-burn-sys", { transactionHash: freezeHash, status: false, blockNumber: -1 }, 2),
];
const mintTransfer = (mint: UtxoTransaction) => nevmTransfer({
  status: "confirm-mint-sysx", logs: [...freezeLogs(), log("mint-sysx", { tx: mint.txid }, 3)],
});
const proofTransfer = (burn: UtxoTransaction, changes: TransferChanges = {}) => transfer({
  status: "submit-proofs", logs: [
    log("burn-sysx", { tx: burn.txid }),
    log("generate-proofs", { ...canonicalProof(burn), header: "00", blockhash: "f".repeat(64), chainlock: true }, 2),
  ], ...changes,
});

describe("canonical transfer progress", () => {
  const originalTestnet = process.env.IS_TESTNET;
  beforeEach(() => {
    process.env.IS_TESTNET = "false";
    jest.resetAllMocks();
    mockFetchRawTx.mockResolvedValue(undefined);
    mockFetchAccount.mockResolvedValue(undefined);
    mockFetchProof.mockResolvedValue(undefined);
    mockWeb3.eth.getTransaction.mockResolvedValue(null);
    mockWeb3.eth.getTransactionReceipt.mockResolvedValue(null);
  });
  afterEach(() => {
    if (originalTestnet === undefined) delete process.env.IS_TESTNET;
    else process.env.IS_TESTNET = originalTestnet;
  });

  it("round-trips real serialized transaction fixtures through the parser", () => {
    for (const stage of ["burn-sys", "burn-sysx-nevm", "mint-sysx", "burn-sysx-sys"] as const) {
      const tx = wireTransaction(stage);
      const parsed = bitcoin.Transaction.fromHex(tx.hex);
      expect(parsed.getId()).toBe(tx.txid);
      const payload = bitcoin.script.decompile(parsed.outs[1].script)[1];
      expect(payload).toBeInstanceOf(Uint8Array);
      const allocations = stage === "mint-sysx" ?
        bufferUtils.deserializeMintSyscoin(Buffer.from(payload)).allocation :
        require("syscointx-js").getAllocationsFromTx(parsed);
      expect(allocations[0].assetGuid).toBe(SYSX_ASSET_GUID);
    }
  });

  it.each([transfer(), nevmTransfer(), transfer({ status: "burn-sys", useSysx: false })])(
    "preserves initial $type/$status without network reads", async (value) => {
      await expect(canonicalizeTransferProgress(value)).resolves.toEqual(value);
      expect(mockFetchRawTx).not.toHaveBeenCalled();
      expect(mockWeb3.eth.getTransaction).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["sys-to-nevm", "confirm-burn-sys"], ["sys-to-nevm", "burn-sysx"],
    ["sys-to-nevm", "confirm-burn-sysx"], ["sys-to-nevm", "generate-proofs"],
    ["sys-to-nevm", "submit-proofs"], ["sys-to-nevm", "finalizing"], ["sys-to-nevm", "completed"],
    ["nevm-to-sys", "confirm-freeze-burn-sys"], ["nevm-to-sys", "mint-sysx"],
    ["nevm-to-sys", "confirm-mint-sysx"], ["nevm-to-sys", "burn-sysx"],
    ["nevm-to-sys", "confirm-burn-sysx"], ["nevm-to-sys", "finalizing"], ["nevm-to-sys", "completed"],
  ])("rejects %s progress %s without preceding evidence", async (type, status) => {
    await expect(canonicalizeTransferProgress(transfer({ type, status, useSysx: false } as Partial<ITransfer>)))
      .rejects.toThrow(TransferValidationError);
    expect(mockFetchRawTx).not.toHaveBeenCalled();
    expect(mockWeb3.eth.getTransaction).not.toHaveBeenCalled();
  });

  it.each(["../transaction", "../tx/" + "a".repeat(64), "00", "0x" + "a".repeat(64)])(
    "rejects a malformed/path-like UTXO reference %s before any provider read", async (tx) => {
      await expect(canonicalizeTransferProgress(transfer({ status: "confirm-burn-sysx", logs: [log("burn-sysx", { tx })] })))
        .rejects.toThrow("Invalid burn-sysx transaction");
      expect(mockFetchRawTx).not.toHaveBeenCalled();
    }
  );

  it("rejects a syntactically valid but nonexistent freeze hash", async () => {
    await expect(canonicalizeTransferProgress(nevmTransfer({
      status: "confirm-freeze-burn-sys", logs: [log("freeze-burn-sys", { hash: freezeHash })],
    }))).rejects.toThrow("Freeze transaction is unavailable");
    expect(mockWeb3.eth.getTransaction).toHaveBeenCalledWith(freezeHash);
  });

  it("rejects a nonexistent proof submission even when the client claims a receipt", async () => {
    const burn = wireTransaction("burn-sysx-nevm", { confirmations: 1 });
    installUtxo(burn);
    mockFetchProof.mockResolvedValue({ result: canonicalProof(burn) });
    const value = proofTransfer(burn);
    value.logs.push(log("submit-proofs", { hash: relayHash, receipt: { status: true } }, 3));
    value.status = COMMON_STATUS.FINALIZING;
    await expect(canonicalizeTransferProgress(value)).rejects.toThrow("Proof submission is unavailable");
    expect(mockWeb3.eth.getTransaction).toHaveBeenCalledWith(relayHash);
  });

  it("rejects '00' as a generated proof for an otherwise valid source burn", async () => {
    const burn = wireTransaction("burn-sysx-nevm", { confirmations: 1 });
    installUtxo(burn);
    await expect(canonicalizeTransferProgress(proofTransfer(burn, {
      logs: [log("burn-sysx", { tx: burn.txid }), log("generate-proofs", { transaction: "00" }, 2)],
    }))).rejects.toThrow("Generated proof does not match");
    expect(mockFetchProof).not.toHaveBeenCalled();
  });

  it("replaces fabricated transaction and confirmation metadata with canonical data", async () => {
    const burn = wireTransaction("burn-sysx-nevm", { confirmations: 1 });
    installUtxo(burn);
    const value = transfer({ status: "generate-proofs", logs: [
      log("burn-sysx", { tx: burn.txid, tokenType: "Fake", confirmations: 999 }),
      log("burn-sysx", { txid: burn.txid, hex: "00", confirmations: 999, vin: [], vout: [] }, 2),
    ] });
    const result = await canonicalizeTransferProgress(value);
    expect(result.logs[0].payload.data).toEqual({ tx: burn.txid });
    expect(result.logs[1].payload.data).toEqual(burn);
    expect(value.logs[1].payload.data.confirmations).toBe(999);
    expect(mockFetchRawTx).toHaveBeenCalledTimes(1);
  });

  it("refreshes client proof fields from the server proof, without requiring a ChainLock", async () => {
    const burn = wireTransaction("burn-sysx-nevm", { confirmations: 1 });
    installUtxo(burn);
    mockFetchProof.mockResolvedValue({ result: canonicalProof(burn) });
    const result = await canonicalizeTransferProgress(proofTransfer(burn));
    expect(result.logs[1].payload.data).toEqual(canonicalProof(burn));
    expect(mockFetchProof).toHaveBeenCalledWith(expect.any(String), burn.txid);
  });

  it("accepts and strips client metadata from a legitimate pending freeze", async () => {
    mockWeb3.eth.getTransaction.mockResolvedValue(freeze());
    const result = await canonicalizeTransferProgress(nevmTransfer({
      status: "confirm-freeze-burn-sys", logs: [log("freeze-burn-sys", { hash: freezeHash, fake: true })],
    }));
    expect(result.logs[0].payload.data).toEqual({ hash: freezeHash });
    expect(mockWeb3.eth.getTransactionReceipt).not.toHaveBeenCalled();
  });

  it("accepts the supported legacy freezeBurnERC20 call while its receipt is pending", async () => {
    mockWeb3.eth.getTransaction.mockResolvedValue(legacyFreeze());
    const value = nevmTransfer({
      status: "confirm-freeze-burn-sys", logs: [log("freeze-burn-sys", { hash: freezeHash })],
    });
    await expect(canonicalizeTransferProgress(value)).resolves.toEqual(value);
    expect(mockWeb3.eth.getTransactionReceipt).not.toHaveBeenCalled();
  });

  it("accepts a legitimate pending relay without requiring its receipt", async () => {
    const burn = wireTransaction("burn-sysx-nevm", { confirmations: 1 });
    installUtxo(burn);
    mockFetchProof.mockResolvedValue({ result: canonicalProof(burn) });
    mockWeb3.eth.getTransaction.mockResolvedValue(relaySubmission(burn));
    const value = proofTransfer(burn, { status: "finalizing" });
    value.logs.push(log("submit-proofs", { hash: relayHash, fake: true }, 3));
    const result = await canonicalizeTransferProgress(value);
    expect(result.logs[2].payload.data).toEqual({ hash: relayHash });
    expect(mockWeb3.eth.getTransactionReceipt).not.toHaveBeenCalled();
  });

  it("replaces a fabricated successful relay receipt with the actual confirmed receipt", async () => {
    const burn = wireTransaction("burn-sysx-nevm", { confirmations: 1 });
    installUtxo(burn);
    mockFetchProof.mockResolvedValue({ result: canonicalProof(burn) });
    mockWeb3.eth.getTransaction.mockResolvedValue(relaySubmission(burn));
    const receipt = { transactionHash: relayHash, status: true, to: relay, blockNumber: 101, logs: [] };
    mockWeb3.eth.getTransactionReceipt.mockResolvedValue(receipt);
    const value = proofTransfer(burn, { status: "finalizing" });
    value.logs.push(log("submit-proofs", { hash: relayHash }, 3),
      log("finalizing", { transactionHash: relayHash, status: true, to: manager, blockNumber: 999999 }, 4));
    const result = await canonicalizeTransferProgress(value);
    expect(result.logs[3].payload.data).toEqual(receipt);
  });

  it.each(["confirm-burn-sys", "burn-sysx"] as const)(
    "preserves zero-conf native SYS conversion at %s", async (status) => {
      const native = wireTransaction("burn-sys");
      installUtxo(native);
      const value = transfer({ useSysx: false, status, logs: [log("burn-sys", { tx: native.txid })] });
      await expect(canonicalizeTransferProgress(value)).resolves.toEqual(value);
    }
  );

  it("accepts zero-conf SYSX burn while the UI is waiting for confirmation", async () => {
    const burn = wireTransaction("burn-sysx-nevm");
    installUtxo(burn);
    const value = transfer({ status: "confirm-burn-sysx", logs: [log("burn-sysx", { tx: burn.txid })] });
    await expect(canonicalizeTransferProgress(value)).resolves.toEqual(value);
  });

  it("does not advance past the burn confirmation without a real confirmation", async () => {
    const burn = wireTransaction("burn-sysx-nevm");
    installUtxo(burn);
    await expect(canonicalizeTransferProgress(transfer({
      status: "generate-proofs", logs: [log("burn-sysx", { tx: burn.txid })],
    }))).rejects.toThrow("not confirmed on Syscoin");
  });

  it("accepts a zero-conf SYSX mint linked to the confirmed freeze and refreshes its receipt", async () => {
    const mint = wireTransaction("mint-sysx");
    installUtxo(mint);
    mockWeb3.eth.getTransaction.mockResolvedValue(freeze());
    mockWeb3.eth.getTransactionReceipt.mockResolvedValue(freezeReceipt());
    const result = await canonicalizeTransferProgress(mintTransfer(mint));
    expect(result.logs[1].payload.data).toEqual(freezeReceipt());
    expect(result.logs[2].payload.data).toEqual({ tx: mint.txid });
    expect(result.status).toBe("confirm-mint-sysx");
  });

  it.each([0, 1, 127, 128, 256])("binds mint proof to RLP transaction index %i", async (index) => {
    const mint = wireTransaction("mint-sysx", { txpath: encodedTransactionIndex(index) });
    installUtxo(mint);
    mockWeb3.eth.getTransaction.mockResolvedValue(freeze());
    mockWeb3.eth.getTransactionReceipt.mockResolvedValue(freezeReceipt({ transactionIndex: index }));
    await expect(canonicalizeTransferProgress(mintTransfer(mint))).resolves.toBeDefined();
  });

  it.each(["burn-sysx-nevm", "burn-sysx-sys"] as const)(
    "accepts fungible older SYSX inputs from the same server-verified xpub (%s)", async (stage) => {
      const burn = wireTransaction(stage, { sourceAddress: olderAddress });
      installUtxo(burn);
      mockFetchAccount.mockResolvedValue({ tokens: [{ type: "XPUBAddress", name: olderAddress }] });
      const value = stage === "burn-sysx-nevm" ? transfer() : nevmTransfer();
      value.status = COMMON_STATUS.ERROR;
      value.logs = [log("burn-sysx", { tx: burn.txid })];
      await expect(canonicalizeTransferProgress(value)).resolves.toEqual(value);
      expect(mockFetchAccount).toHaveBeenCalledWith(expect.any(String), account, "details=tokens&tokens=used", true);
    }
  );

  it("preserves real mixed native/SYSX conversion allocations at payout output zero", async () => {
    const burn = mixedConversionTransaction();
    installUtxo(burn);
    const value = nevmTransfer({ status: "error", logs: [
      log("burn-sysx", { tx: burn.txid }), log("burn-sysx", burn, 2),
    ] });
    const result = await canonicalizeTransferProgress(value);
    expect(result.logs[1].payload.data).toEqual(burn);
    expect(result.logs[1].payload.data.vout[0].assetInfo.value).toBe("2100000");
  });

  it.each([
    ["wrong recipient", { recipient: olderAddress }],
    ["wrong amount", { conversionValue: "10000001" }],
    ["later matching output with wrong payout recipient", { recipient: olderAddress, laterMatchingOutput: true }],
  ])("rejects mixed native/SYSX conversion with %s", async (_label, options) => {
    const burn = mixedConversionTransaction(options);
    installUtxo(burn);
    await expect(canonicalizeTransferProgress(nevmTransfer({
      status: "error", logs: [log("burn-sysx", { tx: burn.txid })],
    }))).rejects.toThrow("SYSX conversion recipient does not match");
  });

  it.each([undefined, { tokens: [{ type: "XPUBAddress", name: address }] },
    { tokens: [{ type: "ERC20", name: olderAddress }] }])(
    "rejects older SYSX inputs not verified as this account (%p)", async (found) => {
      const burn = wireTransaction("burn-sysx-nevm", { sourceAddress: olderAddress });
      installUtxo(burn);
      mockFetchAccount.mockResolvedValue(found);
      await expect(canonicalizeTransferProgress(transfer({ status: "confirm-burn-sysx", logs: [log("burn-sysx", { tx: burn.txid })] })))
        .rejects.toThrow("transfer account");
    }
  );

  describe("diagnostic logs", () => {
    it.each(["error", "burn-sys", "burn-sysx", "mint-sysx", "freeze-burn-sys", "submit-proofs"] as const)(
      "preserves an error-only diagnostic at transaction/error stage %s", async (status) => {
        const value = transfer({ status: "error", logs: [log(status, { error: { message: "Try again" } })] });
        await expect(canonicalizeTransferProgress(value)).resolves.toEqual(value);
        expect(mockFetchRawTx).not.toHaveBeenCalled();
        expect(mockWeb3.eth.getTransaction).not.toHaveBeenCalled();
      }
    );
    it.each(["confirm-burn-sys", "confirm-burn-sysx", "confirm-mint-sysx", "confirm-freeze-burn-sys",
      "generate-proofs", "finalizing", "completed", "switch"] as const)(
      "rejects error-only diagnostics impersonating %s", async (status) => {
        await expect(canonicalizeTransferProgress(transfer({
          status: "error", logs: [log(status, { error: "Try again" })],
        }))).rejects.toThrow("Error diagnostics cannot impersonate");
      }
    );
    it("does not treat mixed error/transaction claims as an error-only diagnostic", async () => {
      await expect(canonicalizeTransferProgress(nevmTransfer({
        status: "error", logs: [log("freeze-burn-sys", { hash: freezeHash, error: "Try again" })],
      }))).rejects.toThrow("Freeze transaction is unavailable");
    });
  });

  describe("immutable history", () => {
    it("allows Mongo log IDs and refreshed confirmations without rewriting identity", async () => {
      const burn = wireTransaction("burn-sysx-nevm", { confirmations: 2 });
      installUtxo(burn);
      const value = transfer({ status: "generate-proofs", logs: [
        log("burn-sysx", { tx: burn.txid }),
        log("burn-sysx", { txid: burn.txid, confirmations: 999 }, 2),
      ] });
      const existing = { ...value, logs: [
        { ...value.logs[0], _id: "mongo-broadcast-id" },
        { ...value.logs[1], _id: "mongo-log-id", payload: { ...value.logs[1].payload,
          data: { ...burn, confirmations: 1, _id: "mongo-receipt-id" } } },
      ] };
      const result = await canonicalizeTransferProgress(value, existing);
      expect(result.logs[1].payload.data).toEqual(burn);
    });

    it("is idempotent after canonical replacement and further provider confirmations", async () => {
      const burn = wireTransaction("burn-sysx-nevm", { confirmations: 1 });
      installUtxo(burn);
      const value = transfer({ status: "generate-proofs", logs: [
        log("burn-sysx", { tx: burn.txid }),
        log("burn-sysx", { txid: burn.txid, confirmations: 999 }, 2),
      ] });
      const canonical = await canonicalizeTransferProgress(value);
      await expect(canonicalizeTransferProgress(canonical, canonical)).resolves.toEqual(canonical);
      installUtxo({ ...burn, confirmations: 2 });
      const refreshed = await canonicalizeTransferProgress(canonical, canonical);
      expect(refreshed.logs[1].payload.data.confirmations).toBe(2);
    });

    it("rejects a stale history that omits a newer persisted log", async () => {
      const old = transfer({ status: "error", logs: [log("error", { error: "First failure" })] });
      const existing = { ...old, logs: [...old.logs, log("error", { error: "Second failure" }, 2)] };
      await expect(canonicalizeTransferProgress(old, existing)).rejects.toThrow("history cannot be removed");
    });

    it.each(["date", "message", "previousStatus", "transaction", "diagnostic"])(
      "rejects rewritten %s history", async (field) => {
        const existing = transfer({ status: "error", logs: [log("error", { error: "Original" })] });
        const value = { ...existing, logs: [{ ...existing.logs[0], payload: { ...existing.logs[0].payload } }] };
        if (field === "date") value.logs[0].date = 2;
        else if (field === "message") value.logs[0].payload.message = "Changed";
        else if (field === "previousStatus") value.logs[0].payload.previousStatus = SYS_TO_ETH_TRANSFER_STATUS.BURN_SYSX;
        else if (field === "transaction") {
          existing.logs = [log("burn-sysx", { tx: "a".repeat(64) })];
          value.logs = [log("burn-sysx", { tx: "b".repeat(64) })];
        } else value.logs[0].payload.data = { error: "Changed" };
        await expect(canonicalizeTransferProgress(value, existing)).rejects.toThrow("history cannot be rewritten");
        expect(mockFetchRawTx).not.toHaveBeenCalled();
      }
    );

    it("rejects backward progress and reopening completed transfers", async () => {
      await expect(canonicalizeTransferProgress(transfer(), transfer({ status: "generate-proofs" })))
        .rejects.toThrow("cannot move backwards");
      await expect(canonicalizeTransferProgress(transfer({ status: "error" }), transfer({ status: "completed" })))
        .rejects.toThrow("cannot be reopened");
    });
  });

  describe("verified progress high-water mark", () => {
    const native = wireTransaction("burn-sys");
    const burn = wireTransaction("burn-sysx-nevm", { confirmations: 1 });
    const mint = wireTransaction("mint-sysx");
    const conversion = wireTransaction("burn-sysx-sys", { confirmations: 1 });
    const burnLogs = [log("burn-sysx", { tx: burn.txid })];
    const proofLogs = [...burnLogs, log("generate-proofs", canonicalProof(burn), 2)];
    const relayLogs = [...proofLogs, log("submit-proofs", { hash: relayHash }, 3)];
    const mintLogs = [...freezeLogs(), log("mint-sysx", { tx: mint.txid }, 3)];

    it.each([
      ["native broadcast", transfer({ useSysx: false, status: "burn-sys", logs: [log("burn-sys", { tx: native.txid })] })],
      ["native confirmation", transfer({ useSysx: false, status: "confirm-burn-sys", logs: [
        log("burn-sys", { tx: native.txid }), log("burn-sys", native, 2),
      ] })],
      ["forward SYSX broadcast", transfer({ status: "burn-sysx", logs: burnLogs })],
      ["forward SYSX confirmation", transfer({ status: "confirm-burn-sysx", logs: [...burnLogs, log("burn-sysx", burn, 2)] })],
      ["generated proofs", transfer({ status: "generate-proofs", logs: proofLogs })],
      ["submitted proofs", transfer({ status: "submit-proofs", logs: relayLogs })],
      ["freeze broadcast", nevmTransfer({ status: "freeze-burn-sys", logs: [log("freeze-burn-sys", { hash: freezeHash })] })],
      ["freeze confirmation", nevmTransfer({ status: "confirm-freeze-burn-sys", logs: freezeLogs() })],
      ["mint broadcast", nevmTransfer({ status: "mint-sysx", logs: mintLogs })],
      ["mint confirmation", nevmTransfer({ status: "confirm-mint-sysx", logs: [...mintLogs, log("mint-sysx", mint, 4)] })],
      ["reverse SYSX broadcast", nevmTransfer({ status: "burn-sysx", logs: [
        ...mintLogs, log("burn-sysx", { tx: conversion.txid }, 4),
      ] })],
      ["reverse SYSX confirmation", nevmTransfer({ status: "confirm-burn-sysx", logs: [
        ...mintLogs, log("burn-sysx", { tx: conversion.txid }, 4), log("burn-sysx", conversion, 5),
      ] })],
    ])("does not re-expose signing/progress before %s", async (_label, value) => {
      await expect(canonicalizeTransferProgress(value as ITransfer))
        .rejects.toThrow("Transfer progress cannot return to an already submitted transaction");
      expect(mockFetchRawTx).not.toHaveBeenCalled();
      expect(mockWeb3.eth.getTransaction).not.toHaveBeenCalled();
    });

    it.each([
      ["forward relay", transfer({ status: "switch", logs: [...relayLogs, log("switch", { address: recipient }, 4)] })],
      ["reverse mint", nevmTransfer({ status: "switch", logs: [...mintLogs, log("switch", { address }, 4)] })],
    ])("does not use switch to return behind an already submitted %s", async (_label, value) => {
      await expect(canonicalizeTransferProgress(value as ITransfer))
        .rejects.toThrow("Transfer progress cannot return to an already submitted transaction");
    });

    it.each(["burn-sysx", "confirm-burn-sysx", "generate-proofs", "submit-proofs", "switch"] as const)(
      "does not use ERROR to recover behind a verified relay at %s", async (status) => {
        installUtxo(burn);
        mockFetchProof.mockResolvedValue({ result: canonicalProof(burn) });
        mockWeb3.eth.getTransaction.mockResolvedValue(relaySubmission(burn));
        const submitted = await canonicalizeTransferProgress(transfer({ status: "finalizing", logs: relayLogs }));
        const errored = await canonicalizeTransferProgress({ ...submitted, status: COMMON_STATUS.ERROR,
          logs: [...submitted.logs, log("error", { error: "Saving failed" }, 4)] }, submitted);
        const incoming = transfer({ ...errored, status });
        await expect(canonicalizeTransferProgress(incoming, errored))
          .rejects.toThrow("Transfer progress cannot move backwards");
        expect(verifiedTransferProgressStatus(errored, submitted)).toBe("finalizing");
      }
    );

    it("does not use reverse ERROR/switch recovery to return behind a submitted mint", async () => {
      installUtxo(mint);
      mockWeb3.eth.getTransaction.mockResolvedValue(freeze());
      mockWeb3.eth.getTransactionReceipt.mockResolvedValue(freezeReceipt());
      const submitted = await canonicalizeTransferProgress(mintTransfer(mint));
      const errored = await canonicalizeTransferProgress({ ...submitted, status: COMMON_STATUS.ERROR,
        logs: [...submitted.logs, log("error", { error: "Saving failed" }, 4)] }, submitted);
      for (const status of ["freeze-burn-sys", "confirm-freeze-burn-sys", "mint-sysx", "switch"] as const) {
        await expect(canonicalizeTransferProgress(nevmTransfer({ ...errored, status }), errored))
          .rejects.toThrow("Transfer progress cannot move backwards");
      }
      expect(verifiedTransferProgressStatus(errored, submitted)).toBe("confirm-mint-sysx");
    });

    it.each(["confirm-burn-sysx", "generate-proofs"] as const)(
      "allows legitimate source-burn ERROR recovery at the same/later %s stage", async (status) => {
        installUtxo(burn);
        const pending = await canonicalizeTransferProgress(transfer({ status: "confirm-burn-sysx", logs: burnLogs }));
        const errored = await canonicalizeTransferProgress({ ...pending, status: COMMON_STATUS.ERROR,
          logs: [...pending.logs, log("error", { error: "Saving failed" }, 2)] }, pending);
        const serverCheckpoint = { ...errored, status: SYS_TO_ETH_TRANSFER_STATUS.CONFIRM_BURN_SYSX };
        const recovered = await canonicalizeTransferProgress(transfer({ ...errored, status }), serverCheckpoint);
        expect(recovered.status).toBe(status);
        expect(verifiedTransferProgressStatus(recovered, serverCheckpoint)).toBe(status);
        expect(mockFetchRawTx).toHaveBeenCalledWith(expect.any(String), burn.txid);
      }
    );

    it.each(["confirm-mint-sysx", "burn-sysx"] as const)(
      "allows legitimate mint ERROR recovery at the same/later %s stage", async (status) => {
        installUtxo(mint);
        mockWeb3.eth.getTransaction.mockResolvedValue(freeze());
        mockWeb3.eth.getTransactionReceipt.mockResolvedValue(freezeReceipt());
        const pending = await canonicalizeTransferProgress(mintTransfer(mint));
        const errored = await canonicalizeTransferProgress({ ...pending, status: COMMON_STATUS.ERROR,
          logs: [...pending.logs, log("error", { error: "Saving failed" }, 4)] }, pending);
        const serverCheckpoint = nevmTransfer({ ...errored, status: "confirm-mint-sysx" });
        const recovered = await canonicalizeTransferProgress(nevmTransfer({ ...errored, status }), serverCheckpoint);
        expect(recovered.status).toBe(status);
        expect(verifiedTransferProgressStatus(recovered, serverCheckpoint)).toBe(status);
      }
    );

    it("allows recovery to a pending relay checkpoint without signing it again", async () => {
      installUtxo(burn);
      mockFetchProof.mockResolvedValue({ result: canonicalProof(burn) });
      mockWeb3.eth.getTransaction.mockResolvedValue(relaySubmission(burn));
      const pending = await canonicalizeTransferProgress(transfer({ status: "finalizing", logs: relayLogs }));
      const errored = await canonicalizeTransferProgress({ ...pending, status: COMMON_STATUS.ERROR,
        logs: [...pending.logs, log("error", { error: "Saving failed" }, 4)] }, pending);
      const recovered = await canonicalizeTransferProgress(transfer({ ...errored, status: "finalizing" }), pending);
      expect(recovered.status).toBe("finalizing");
      expect(verifiedTransferProgressStatus(recovered, pending)).toBe("finalizing");
      expect(mockWeb3.eth.getTransactionReceipt).not.toHaveBeenCalled();
    });

    it.each([
      ["forward", transfer({ status: "switch", logs: [...proofLogs, log("switch", { address: recipient }, 3)] }), "submit-proofs"],
      ["reverse", nevmTransfer({ status: "switch", logs: [...freezeLogs(), log("switch", { address }, 3)] }), "mint-sysx"],
    ])("maps a legitimate %s switch to its next unsubmitted checkpoint", async (route, value, checkpoint) => {
      installUtxo(burn);
      mockFetchProof.mockResolvedValue({ result: canonicalProof(burn) });
      mockWeb3.eth.getTransaction.mockResolvedValue(freeze());
      mockWeb3.eth.getTransactionReceipt.mockResolvedValue(freezeReceipt());
      const verified = await canonicalizeTransferProgress(value as ITransfer);
      expect(verifiedTransferProgressStatus(verified)).toBe(checkpoint);
      const errored = { ...verified, status: COMMON_STATUS.ERROR,
        logs: [...verified.logs, log("error", { error: "Saving failed" }, 4)] };
      expect(verifiedTransferProgressStatus(errored, verified)).toBe(checkpoint);
      if (route === "reverse") expect(mockFetchRawTx).not.toHaveBeenCalled();
    });

    it.each([
      ["native initial", transfer({ useSysx: false, status: "error", logs: [log("burn-sys", { error: "Not submitted" })] }), "burn-sys"],
      ["SYSX initial", transfer({ status: "error", logs: [log("burn-sysx", { error: "Not submitted" })] }), "burn-sysx"],
      ["reverse initial", nevmTransfer({ status: "error", logs: [log("freeze-burn-sys", { error: "Not submitted" })] }), "freeze-burn-sys"],
      ["burn broadcast", transfer({ status: "error", logs: burnLogs }), "confirm-burn-sysx"],
      ["burn confirmation", transfer({ status: "error", logs: [...burnLogs, log("burn-sysx", burn, 2)] }), "generate-proofs"],
      ["generated proofs", transfer({ status: "error", logs: proofLogs }), "submit-proofs"],
      ["relay broadcast", transfer({ status: "error", logs: relayLogs }), "finalizing"],
      ["freeze broadcast", nevmTransfer({ status: "error", logs: [log("freeze-burn-sys", { hash: freezeHash })] }), "confirm-freeze-burn-sys"],
      ["freeze confirmation", nevmTransfer({ status: "error", logs: freezeLogs() }), "mint-sysx"],
      ["mint broadcast", nevmTransfer({ status: "error", logs: mintLogs }), "confirm-mint-sysx"],
      ["mint confirmation", nevmTransfer({ status: "error", logs: [...mintLogs, log("mint-sysx", mint, 4)] }), "burn-sysx"],
      ["reverse burn confirmation", nevmTransfer({ status: "error", logs: [
        ...mintLogs, log("burn-sysx", { tx: conversion.txid }, 4), log("burn-sysx", conversion, 5),
      ] }), "finalizing"],
    ])("records the verified %s checkpoint while the public status is ERROR", async (_label, value, checkpoint) => {
      installUtxo(native, burn, mint, conversion);
      mockFetchProof.mockResolvedValue({ result: canonicalProof(burn) });
      mockWeb3.eth.getTransaction.mockImplementation(async (hash: string) => hash === freezeHash ? freeze() : relaySubmission(burn));
      mockWeb3.eth.getTransactionReceipt.mockResolvedValue(freezeReceipt());
      const canonical = await canonicalizeTransferProgress(value as ITransfer);
      expect(canonical.status).toBe("error");
      expect(verifiedTransferProgressStatus(canonical)).toBe(checkpoint);
    });

    it("retains a higher server checkpoint not represented by submission-only logs on ERROR", async () => {
      installUtxo(burn);
      const existing = await canonicalizeTransferProgress(transfer({ status: "generate-proofs", logs: burnLogs }));
      const errored = await canonicalizeTransferProgress({ ...existing, status: COMMON_STATUS.ERROR,
        logs: [...existing.logs, log("error", { error: "Proof temporarily unavailable" }, 2)] }, existing);
      expect(verifiedTransferProgressStatus(errored, existing)).toBe("generate-proofs");
      await expect(canonicalizeTransferProgress(transfer({ ...errored, status: "confirm-burn-sysx" }), existing))
        .rejects.toThrow("Transfer progress cannot move backwards");
    });
  });

  describe("chain evidence binding", () => {
    it.each([
      ["native conversion on reverse route", nevmTransfer({ status: "error", logs: [log("burn-sys", { tx: "a".repeat(64) })] })],
      ["mint on forward route", transfer({ status: "error", logs: [log("mint-sysx", { tx: "a".repeat(64) })] })],
      ["proof on reverse route", nevmTransfer({ status: "error", logs: [log("generate-proofs", { transaction: "00" })] })],
      ["relay on reverse route", nevmTransfer({ status: "error", logs: [log("submit-proofs", { hash: relayHash })] })],
    ])("rejects %s", async (_label, value) => {
      await expect(canonicalizeTransferProgress(value as ITransfer)).rejects.toThrow("does not belong to this route");
    });

    it("rejects conflicting transaction references", async () => {
      await expect(canonicalizeTransferProgress(transfer({ status: "generate-proofs", logs: [
        log("burn-sysx", { tx: "a".repeat(64) }), log("burn-sysx", { txid: "b".repeat(64) }, 2),
      ] }))).rejects.toThrow("Conflicting burn-sysx transactions");
      expect(mockFetchRawTx).not.toHaveBeenCalled();
    });

    it.each([
      ["wrong wire version", { version: 138 }, "Not this route's SYSX burn"],
      ["wrong asset", { asset: "123457" }, "SYSX burn amount does not match"],
      ["wrong amount", { amount: "10000001" }, "SYSX burn amount does not match"],
      ["wrong allocation index", { allocationIndex: 0 }, "SYSX burn amount does not match"],
      ["wrong NEVM recipient", { ethaddress: manager }, "SYSX burn recipient does not match"],
    ])("rejects SYSX burn %s", async (_label, options, message) => {
      const burn = wireTransaction("burn-sysx-nevm", options as WireOptions);
      installUtxo(burn);
      await expect(canonicalizeTransferProgress(transfer({ status: "confirm-burn-sysx", logs: [log("burn-sysx", { tx: burn.txid })] })))
        .rejects.toThrow(message as string);
    });

    it.each([
      ["wrong recipient", { recipient: olderAddress }, "SYS conversion does not match"],
      ["wrong amount", { amount: "10000001" }, "SYS conversion does not match"],
      ["wrong asset", { asset: "123457" }, "SYS conversion does not match"],
      ["wrong wire version", { version: 141 }, "Not a SYS to SYSX conversion"],
    ])("rejects native conversion %s", async (_label, options, message) => {
      const native = wireTransaction("burn-sys", options as WireOptions);
      installUtxo(native);
      await expect(canonicalizeTransferProgress(transfer({
        status: "confirm-burn-sys", useSysx: false, logs: [log("burn-sys", { tx: native.txid })],
      }))).rejects.toThrow(message as string);
    });

    it.each([
      ["wrong recipient", { recipient: olderAddress }, "SYSX conversion recipient does not match"],
      ["wrong payout amount", { conversionValue: "10000001" }, "SYSX conversion recipient does not match"],
      ["wrong allocation amount", { amount: "10000001" }, "SYSX burn amount does not match"],
      ["NEVM-only recipient", { ethaddress: recipient }, "SYSX conversion recipient does not match"],
    ])("rejects SYSX-to-SYS conversion %s", async (_label, options, message) => {
      const burn = wireTransaction("burn-sysx-sys", options as WireOptions);
      installUtxo(burn);
      await expect(canonicalizeTransferProgress(nevmTransfer({
        status: "error", logs: [log("burn-sysx", { tx: burn.txid })],
      }))).rejects.toThrow(message as string);
    });

    it.each([
      ["wrong freeze block", { blockhash: `0x${"f".repeat(64)}` }, "SYSX mint does not prove"],
      ["wrong freeze index", { txpath: "01" }, "SYSX mint does not prove"],
      ["wrong recipient", { recipient: olderAddress }, "SYSX mint does not match"],
      ["wrong amount", { amount: "10000001" }, "SYSX mint does not match"],
      ["wrong asset", { asset: "123457" }, "SYSX mint does not match"],
      ["wrong wire version", { version: 139 }, "Not a SYSX mint"],
    ])("rejects SYSX mint %s", async (_label, options, message) => {
      const mint = wireTransaction("mint-sysx", options as WireOptions);
      installUtxo(mint);
      mockWeb3.eth.getTransaction.mockResolvedValue(freeze());
      mockWeb3.eth.getTransactionReceipt.mockResolvedValue(freezeReceipt());
      await expect(canonicalizeTransferProgress(mintTransfer(mint))).rejects.toThrow(message as string);
    });

    it.each([
      ["wrong hash", { hash: relayHash }], ["wrong sender", { from: relay }],
      ["wrong contract", { to: relay }], ["wrong amount", { value: "1" }],
      ["unknown pending selector", { input: "0x00000000" }],
    ])("rejects pending freeze %s", async (_label, changes) => {
      mockWeb3.eth.getTransaction.mockResolvedValue(freeze(changes));
      await expect(canonicalizeTransferProgress(nevmTransfer({
        status: "confirm-freeze-burn-sys", logs: [log("freeze-burn-sys", { hash: freezeHash })],
      }))).rejects.toThrow(TransferValidationError);
    });

    it("rejects a pending freeze call with a mismatched destination", async () => {
      mockWeb3.eth.getTransaction.mockResolvedValue(freeze({ input:
        mockWeb3.eth.abi.encodeFunctionCall(managerAbi.find((method) => method.name === "freezeBurn")!,
          ["100000000000000000", "0x0000000000000000000000000000000000000000", "0", olderAddress]),
      }));
      await expect(canonicalizeTransferProgress(nevmTransfer({ status: "confirm-freeze-burn-sys", logs: [log("freeze-burn-sys", { hash: freezeHash })] })))
        .rejects.toThrow("Freeze call does not match");
    });

    it.each([
      ["wrong amount", ["1", SYSX_ASSET_GUID, address]],
      ["wrong asset", ["100000000000000000", "123457", address]],
      ["wrong destination", ["100000000000000000", SYSX_ASSET_GUID, olderAddress]],
    ])("rejects pending legacy freezeBurnERC20 %s", async (_label, values) => {
      mockWeb3.eth.getTransaction.mockResolvedValue(legacyFreeze(values as string[]));
      await expect(canonicalizeTransferProgress(nevmTransfer({
        status: "confirm-freeze-burn-sys", logs: [log("freeze-burn-sys", { hash: freezeHash })],
      }))).rejects.toThrow("Freeze call does not match");
      expect(mockWeb3.eth.getTransactionReceipt).not.toHaveBeenCalled();
    });

    it.each(["wrong contract", "wrong source burn", "wrong selector"])(
      "rejects relay submission %s", async (label) => {
        const burn = wireTransaction("burn-sysx-nevm", { confirmations: 1 });
        installUtxo(burn);
        mockFetchProof.mockResolvedValue({ result: canonicalProof(burn) });
        const changes = label === "wrong contract" ? { to: manager } : label === "wrong selector" ?
          { input: "0x00000000" } : { input: relaySubmission(wireTransaction("burn-sysx-nevm", { amount: "10000001" })).input };
        mockWeb3.eth.getTransaction.mockResolvedValue(relaySubmission(burn, changes));
        const value = proofTransfer(burn, { status: "finalizing" });
        value.logs.push(log("submit-proofs", { hash: relayHash }, 3));
        await expect(canonicalizeTransferProgress(value)).rejects.toThrow(TransferValidationError);
      }
    );

    it("rejects raw bytes whose transaction ID differs from the provider ID", async () => {
      const burn = wireTransaction("burn-sysx-nevm");
      installUtxo({ ...burn, hex: wireTransaction("burn-sysx-nevm", { amount: "10000001" }).hex });
      await expect(canonicalizeTransferProgress(transfer({ status: "confirm-burn-sysx", logs: [log("burn-sysx", { tx: burn.txid })] })))
        .rejects.toThrow("bytes do not match its ID");
    });

    it("normalizes the parser failure for a provider's invalid '00' transaction buffer", async () => {
      const burn = wireTransaction("burn-sysx-nevm");
      installUtxo({ ...burn, hex: "00" });
      await expect(canonicalizeTransferProgress(transfer({
        status: "confirm-burn-sysx", logs: [log("burn-sysx", { tx: burn.txid })],
      }))).rejects.toThrow("Unable to verify transfer progress; retry saving once its transactions are available");
    });

    it("rejects a malformed canonical proof without persisting client proof data", async () => {
      const burn = wireTransaction("burn-sysx-nevm", { confirmations: 1 });
      installUtxo(burn);
      mockFetchProof.mockResolvedValue({ result: { ...canonicalProof(burn), header: "00", blockhash: "fake-block" } });
      await expect(canonicalizeTransferProgress(proofTransfer(burn))).rejects.toThrow("Canonical SPV proof is unavailable");
    });

    it("normalizes provider failures to a retryable validation failure", async () => {
      const burn = wireTransaction("burn-sysx-nevm");
      mockFetchRawTx.mockRejectedValue(new Error("RPC offline"));
      await expect(canonicalizeTransferProgress(transfer({ status: "confirm-burn-sysx", logs: [log("burn-sysx", { tx: burn.txid })] })))
        .rejects.toThrow("Unable to verify transfer progress; retry saving");
    });
  });
});
