import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import Web3 from "web3";
import { COMMON_STATUS, ETH_TO_SYS_TRANSFER_STATUS, ITransfer, SYS_TO_ETH_TRANSFER_STATUS } from "@contexts/Transfer/types";
import relayAbi from "@contexts/Transfer/relay-abi";
import SyscoinERC20ManagerABI from "@contexts/Transfer/abi/SyscoinERC20Manager";
import { syscoinTxIdFromWitnessStrippedHex } from "utils/syscoin-txid";

const mockWeb3 = {
  eth: {
    abi: new Web3().eth.abi,
    getTransaction: jest.fn<any>(),
    getTransactionReceipt: jest.fn<any>(),
  },
};
const mockFetchRawTx = jest.fn<any>();
const mockFetchAccount = jest.fn<any>();
const mockAssertMintEligible = jest.fn<any>();
const mockDecodeMint = jest.fn<any>();

jest.mock("@constants", () => ({
  ERC20_MANAGER_CONTRACT_ADDRESS: "0x2222222222222222222222222222222222222222",
  RELAY_CONTRACT_ADDRESS: "0x3333333333333333333333333333333333333333",
}));
jest.mock("utils/get-web3", () => ({ __esModule: true, default: mockWeb3 }));
jest.mock("syscoinjs-lib", () => ({ utils: {
  fetchBackendRawTx: mockFetchRawTx,
  fetchBackendAccount: mockFetchAccount,
  bitcoinjs: {
    Transaction: { fromHex: (hex: string) => ({ outs: [{ script: Buffer.from(hex, "hex") }] }) },
    script: { decompile: (script: Buffer) => [0x6a, script] },
  },
} }));
jest.mock("syscointx-js", () => ({ bufferUtils: { deserializeMintSyscoin: mockDecodeMint } }));
jest.mock("../sponsor-utxo-eligibility", () => ({
  assertFreezeBurnMatchesTransfer: mockAssertMintEligible,
}));

import { assertTransferCompleted } from "../transfer-completion";
import { TransferValidationError } from "../transfer-validation";

const manager = "0x2222222222222222222222222222222222222222";
const relay = "0x3333333333333333333333333333333333333333";
const recipient = "0x1111111111111111111111111111111111111111";
const rawBurn = "01000000";
const burnHash = syscoinTxIdFromWitnessStrippedHex(rawBurn);
const mintHash = "b".repeat(64);
const nevmHash = `0x${"c".repeat(64)}`;
const blockHash = `0x${"d".repeat(64)}`;
const assetInfo = { assetGuid: "123456", value: "10000000" };
const address = "sys1destination";
const olderAddress = "sys1otherderivedaddress";
const transfer = (type: ITransfer["type"] = "sys-to-nevm"): ITransfer => ({
  id: "transfer-1", type, status: COMMON_STATUS.COMPLETED, amount: "0.1",
  createdAt: 1, version: "v2", agreedToTerms: true,
  utxoAddress: address, utxoXpub: "xpub", nevmAddress: recipient,
  logs: [
    { date: 1, status: SYS_TO_ETH_TRANSFER_STATUS.BURN_SYSX, payload: { message: "burn", data: { tx: burnHash } } },
    { date: 2, status: SYS_TO_ETH_TRANSFER_STATUS.SUBMIT_PROOFS, payload: { message: "relay", data: { hash: nevmHash } } },
    { date: 3, status: ETH_TO_SYS_TRANSFER_STATUS.MINT_SYSX, payload: { message: "mint", data: { tx: mintHash } } },
  ],
});

const unfreeze = SyscoinERC20ManagerABI.find((item) => item.name === "TokenUnfreeze")!;
const unfreezeLog = (amount = "10000000", to = recipient, assetGuid = "123456") => ({
  address: manager,
  topics: [
    mockWeb3.eth.abi.encodeEventSignature(unfreeze),
    mockWeb3.eth.abi.encodeParameter("uint64", assetGuid),
    mockWeb3.eth.abi.encodeParameter("address", to),
  ],
  data: mockWeb3.eth.abi.encodeParameter("uint256", amount),
});
const receipt = () => ({
  status: true, to: relay, blockNumber: 100, blockHash,
  transactionIndex: 0, transactionHash: nevmHash, logs: [unfreezeLog()],
});
const nevmTransaction = () => ({
  to: relay,
  input: mockWeb3.eth.abi.encodeFunctionCall(
    relayAbi.find((item) => item.name === "relayTx")!,
    ["1", `0x${rawBurn}`, "0", [], "0x", "0x", []] as any
  ),
});
const sourceBurn = () => ({
  txid: burnHash, tokenType: "SPTAssetAllocationBurnToNEVM", confirmations: 1,
  vin: [{ n: 0, value: "680", addresses: [address], assetInfo }], vout: [],
});
const mint = () => ({
  txid: mintHash, tokenType: "SPTAssetAllocationMint", confirmations: 1, hex: "00",
  vin: [], vout: [{ n: 0, value: "680", addresses: [address], assetInfo }],
});
const destinationBurn = () => ({
  txid: burnHash, tokenType: "SPTAssetAllocationBurnToSyscoin", confirmations: 1,
  vin: [{ n: 0, txid: mintHash, value: "680", addresses: [address], assetInfo }],
  vout: [
    { n: 0, value: "10000000", addresses: [address] },
    { n: 1, value: "0", assetInfo },
  ],
});

// A larger SYSX input leaves real allocation change on the native payout output.
// Derive the provider metadata from the unsigned builder's serialized allocation.
const mixedDestinationBurn = (sourceAddress = address) => {
  const syscointx = jest.requireActual<any>("syscointx-js");
  const bitcoin = jest.requireActual<any>("bitcoinjs-lib");
  const BN = jest.requireActual<any>("bn.js");
  const result = syscointx.assetAllocationBurn(
    { ethaddress: Buffer.alloc(0) }, { rbf: true },
    { assets: new Map(), utxos: [{
      txId: "e".repeat(64), vout: 0, type: "BECH32", address: sourceAddress,
      value: new BN("100000000"),
      assetInfo: { assetGuid: assetInfo.assetGuid, value: new BN("12100000") },
    }] },
    new Map([[assetInfo.assetGuid, {
      changeAddress: address, outputs: [{ address, value: new BN(assetInfo.value) }],
    }]]), address, new BN(10)
  );
  expect(result.success).toBe(true);
  expect(result.txVersion).toBe(138);
  const burnIndex = result.outputs.findIndex((output: any) => output.script);
  const payload = bitcoin.script.decompile(result.outputs[burnIndex].script)[1];
  const allocations = syscointx.bufferUtils.deserializeAllocationBurn(Buffer.from(payload), true).allocation;
  const vout = result.outputs.map((output: any, n: number) => {
    const allocation = allocations.find((entry: any) => entry.values.some((value: any) => value.n === n));
    const allocationValue = allocation?.values.find((value: any) => value.n === n);
    return {
      n, value: output.value.toString(), ...(output.script ? {} : { addresses: [output.address] }),
      ...(allocation ? { assetInfo: { assetGuid: allocation.assetGuid, value: allocationValue.value.toString() } } : {}),
    };
  });
  expect(vout[0]).toEqual({
    n: 0, value: assetInfo.value, addresses: [address],
    assetInfo: { assetGuid: assetInfo.assetGuid, value: "2100000" },
  });
  expect(vout[burnIndex].assetInfo).toEqual(assetInfo);
  return {
    ...destinationBurn(), vout,
    vin: result.inputs.map((input: any, n: number) => ({
      n, txid: input.txId, vout: input.vout, value: input.value.toString(), addresses: [input.address],
      assetInfo: { assetGuid: input.assetInfo.assetGuid, value: input.assetInfo.value.toString() },
    })),
  };
};

// The real wallet selector may consume older equal-value SYSX instead of the mint.
const olderSysxInputs = (version: number) => {
  const { coinSelectAsset } = jest.requireActual<any>("coinselectsyscoin");
  const BN = jest.requireActual<any>("bn.js");
  const utxos = [
    { txId: mintHash, address },
    { txId: "e".repeat(64), address: olderAddress },
  ].map((input) => ({
    ...input, vout: 0, type: "BECH32", value: new BN(680),
    assetInfo: { assetGuid: "123456", value: new BN(assetInfo.value) },
  }));
  const selected = coinSelectAsset(utxos, new Map([["123456", {
    changeAddress: address, outputs: [{ address, value: new BN(assetInfo.value) }],
  }]]), new BN(10), version);
  expect(selected.inputs).toEqual([utxos[1]]);
  return selected.inputs.map((input: typeof utxos[number], n: number) => ({
    n, txid: input.txId, vout: input.vout, addresses: [input.address],
    value: input.value.toString(), assetInfo,
  }));
};

describe("canonical transfer completion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWeb3.eth.getTransaction.mockResolvedValue(nevmTransaction());
    mockWeb3.eth.getTransactionReceipt.mockResolvedValue(receipt());
    mockFetchRawTx.mockResolvedValue(sourceBurn());
    mockFetchAccount.mockResolvedValue(undefined);
    mockAssertMintEligible.mockResolvedValue({ transactionHash: nevmHash, blockNumber: 100 });
    mockDecodeMint.mockReturnValue({ blockhash: Buffer.from(blockHash.slice(2), "hex"), txpath: Buffer.from("80", "hex") });
  });

  it("does not add network checks or confirmations to intermediate stages", async () => {
    await expect(assertTransferCompleted({ ...transfer(), status: SYS_TO_ETH_TRANSFER_STATUS.SUBMIT_PROOFS })).resolves.toBeUndefined();
    expect(mockFetchRawTx).not.toHaveBeenCalled();
    expect(mockWeb3.eth.getTransactionReceipt).not.toHaveBeenCalled();
  });

  it("accepts a successful native payout bound to the canonical UTXO burn", async () => {
    await expect(assertTransferCompleted(transfer())).resolves.toBeUndefined();
    expect(mockFetchRawTx).toHaveBeenCalledWith(expect.any(String), burnHash);
    expect(mockWeb3.eth.getTransactionReceipt).toHaveBeenCalledWith(nevmHash);
    expect(mockFetchAccount).not.toHaveBeenCalled();
  });

  it("accepts self-funded SYSX from another server-verified xpub address", async () => {
    mockFetchRawTx.mockResolvedValue({ ...sourceBurn(), vin: olderSysxInputs(141) });
    mockFetchAccount.mockResolvedValue({ tokens: [{ type: "XPUBAddress", name: olderAddress }] });
    await expect(assertTransferCompleted(transfer())).resolves.toBeUndefined();
    expect(mockFetchAccount).toHaveBeenCalledWith(
      expect.any(String), "xpub", "details=tokens&tokens=used", true
    );
  });

  it.each([
    undefined,
    { tokens: [{ type: "XPUBAddress", name: "sys1unrelated" }] },
    { tokens: [{ type: "ERC20", name: olderAddress }] },
  ])("rejects SYSX inputs not verified as part of this account (%p)", async (account) => {
    mockFetchRawTx.mockResolvedValue({ ...sourceBurn(), vin: olderSysxInputs(141) });
    mockFetchAccount.mockResolvedValue(account);
    await expect(assertTransferCompleted(transfer())).rejects.toThrow("transfer account");
  });

  it("requires real transaction identifiers even when logs claim completion", async () => {
    await expect(assertTransferCompleted({ ...transfer(), logs: [] })).rejects.toThrow(TransferValidationError);
    expect(mockFetchRawTx).not.toHaveBeenCalled();
  });

  it.each([
    ["failed receipt", { ...receipt(), status: false }],
    ["wrong contract", { ...receipt(), to: recipient }],
    ["missing payout", { ...receipt(), logs: [] }],
    ["wrong amount", { ...receipt(), logs: [unfreezeLog("999999999")] }],
    ["wrong recipient", { ...receipt(), logs: [unfreezeLog("10000000", relay)] }],
    ["wrong asset", { ...receipt(), logs: [unfreezeLog("10000000", recipient, "123457")] }],
    ["spoof event contract", { ...receipt(), logs: [{ ...unfreezeLog(), address: relay }] }],
  ])("rejects SYS-to-NEVM %s", async (_label, value) => {
    mockWeb3.eth.getTransactionReceipt.mockResolvedValue(value);
    await expect(assertTransferCompleted(transfer())).rejects.toThrow(TransferValidationError);
  });

  it("rejects a valid payout if the relay proves a different burn", async () => {
    mockWeb3.eth.getTransaction.mockResolvedValue({ ...nevmTransaction(), input:
      mockWeb3.eth.abi.encodeFunctionCall(relayAbi[0], ["1", "0x02000000", "0", [], "0x", "0x", []] as any),
    });
    await expect(assertTransferCompleted(transfer())).rejects.toThrow("source burn");
  });

  it("rejects a canonical burn unrelated to the claimed UTXO address", async () => {
    mockFetchRawTx.mockResolvedValue({ ...sourceBurn(), vin: [
      { ...sourceBurn().vin[0], addresses: ["sys1other"] },
    ] });
    await expect(assertTransferCompleted(transfer())).rejects.toThrow("source burn");
  });

  describe("NEVM-to-SYS", () => {
    beforeEach(() => {
      mockFetchRawTx.mockImplementation(async (_url: string, hash: string) =>
        hash === mintHash ? mint() : destinationBurn());
    });

    it("accepts confirmed mint and conversion with the matching freeze proof", async () => {
      await expect(assertTransferCompleted(transfer("nevm-to-sys"))).resolves.toBeUndefined();
      expect(mockAssertMintEligible).toHaveBeenCalledWith(transfer("nevm-to-sys"));
    });

    it("accepts native payout with SYSX change created by overage coin selection", async () => {
      const burn = mixedDestinationBurn();
      mockFetchRawTx.mockImplementation(async (_url: string, hash: string) => hash === mintHash ? mint() : burn);
      await expect(assertTransferCompleted(transfer("nevm-to-sys"))).resolves.toBeUndefined();
    });

    it.each([
      ["wrong amount", { value: "10000001" }],
      ["wrong recipient", { addresses: [olderAddress] }],
    ])("rejects mixed native/SYSX payout with %s", async (_label, payout) => {
      const burn = mixedDestinationBurn();
      burn.vout[0] = { ...burn.vout[0], ...payout };
      mockFetchRawTx.mockImplementation(async (_url: string, hash: string) => hash === mintHash ? mint() : burn);
      await expect(assertTransferCompleted(transfer("nevm-to-sys"))).rejects.toThrow("SYSX conversion does not match");
    });

    it("rejects a later matching native output when mixed payout output zero has the wrong recipient", async () => {
      const burn = mixedDestinationBurn();
      burn.vout[0] = { ...burn.vout[0], addresses: [olderAddress] };
      const laterNative = burn.vout.find((output: any) => output.n > 0 && output.addresses && !output.assetInfo);
      laterNative.value = assetInfo.value;
      mockFetchRawTx.mockImplementation(async (_url: string, hash: string) => hash === mintHash ? mint() : burn);
      await expect(assertTransferCompleted(transfer("nevm-to-sys"))).rejects.toThrow("SYSX conversion does not match");
    });

    it("keeps mixed payout SYSX inputs bound to the transfer account", async () => {
      const burn = mixedDestinationBurn(olderAddress);
      mockFetchRawTx.mockImplementation(async (_url: string, hash: string) => hash === mintHash ? mint() : burn);
      await expect(assertTransferCompleted(transfer("nevm-to-sys"))).rejects.toThrow("transfer account");
    });

    it("still verifies the mint proof before accepting a mixed payout", async () => {
      const burn = mixedDestinationBurn();
      mockFetchRawTx.mockImplementation(async (_url: string, hash: string) => hash === mintHash ? mint() : burn);
      mockDecodeMint.mockReturnValue({ blockhash: Buffer.alloc(32, 1), txpath: Buffer.from("80", "hex") });
      await expect(assertTransferCompleted(transfer("nevm-to-sys"))).rejects.toThrow("does not prove");
    });

    it("accepts conversion of older SYSX selected from the same xpub", async () => {
      const burn = { ...destinationBurn(), vin: olderSysxInputs(138) };
      mockFetchRawTx.mockImplementation(async (_url: string, hash: string) => hash === mintHash ? mint() : burn);
      mockFetchAccount.mockResolvedValue({ tokens: [{ type: "XPUBAddress", name: olderAddress }] });
      await expect(assertTransferCompleted(transfer("nevm-to-sys"))).resolves.toBeUndefined();
    });

    it("rejects borrowing another account's conversion with the same payout", async () => {
      const burn = { ...destinationBurn(), vin: olderSysxInputs(138) };
      mockFetchRawTx.mockImplementation(async (_url: string, hash: string) => hash === mintHash ? mint() : burn);
      mockFetchAccount.mockResolvedValue({ tokens: [{ type: "XPUBAddress", name: address }] });
      await expect(assertTransferCompleted(transfer("nevm-to-sys"))).rejects.toThrow("transfer account");
    });

    it("validates the canonical freeze independently of client confirmation data", async () => {
      mockAssertMintEligible.mockRejectedValueOnce(new Error("Wrong freeze recipient"));
      await expect(assertTransferCompleted(transfer("nevm-to-sys"))).rejects.toThrow(TransferValidationError);
    });

    it.each([
      ["different block", { blockhash: "e".repeat(64), txpath: "80" }],
      ["different transaction index", { blockhash: blockHash.slice(2), txpath: "01" }],
    ])("rejects a mint proving a %s", async (_label, proof) => {
      mockDecodeMint.mockReturnValue({ blockhash: Buffer.from(proof.blockhash, "hex"), txpath: Buffer.from(proof.txpath, "hex") });
      await expect(assertTransferCompleted(transfer("nevm-to-sys"))).rejects.toThrow("does not prove");
    });

    it.each([1, 127, 128, 255, 256])("matches the canonical RLP transaction index %s", async (index) => {
      mockWeb3.eth.getTransactionReceipt.mockResolvedValue({ ...receipt(), transactionIndex: index });
      const encoded: Record<number, string> = { 1: "01", 127: "7f", 128: "8180", 255: "81ff", 256: "820100" };
      mockDecodeMint.mockReturnValue({ blockhash: Buffer.from(blockHash.slice(2), "hex"), txpath: Buffer.from(encoded[index], "hex") });
      await expect(assertTransferCompleted(transfer("nevm-to-sys"))).resolves.toBeUndefined();
    });

    it.each([
      ["unconfirmed conversion", { ...destinationBurn(), confirmations: 0 }],
      ["unrelated account input", { ...destinationBurn(), vin: [{ ...destinationBurn().vin[0], addresses: ["sys1unrelated"] }] }],
      ["missing SYSX input", { ...destinationBurn(), vin: [] }],
      ["wrong amount", { ...destinationBurn(), vout: [{ ...destinationBurn().vout[0], value: "1" }, destinationBurn().vout[1]] }],
      ["wrong recipient", { ...destinationBurn(), vout: [{ ...destinationBurn().vout[0], addresses: ["sys1other"] }, destinationBurn().vout[1]] }],
    ])("rejects %s", async (_label, burn) => {
      mockFetchRawTx.mockImplementation(async (_url: string, hash: string) => hash === mintHash ? mint() : burn);
      await expect(assertTransferCompleted(transfer("nevm-to-sys"))).rejects.toThrow(TransferValidationError);
    });

    it("rejects a mint with the wrong asset allocation", async () => {
      mockFetchRawTx.mockImplementation(async (_url: string, hash: string) => hash === mintHash
        ? { ...mint(), vout: [{ ...mint().vout[0], assetInfo: { ...assetInfo, assetGuid: "123457" } }] }
        : destinationBurn());
      await expect(assertTransferCompleted(transfer("nevm-to-sys"))).rejects.toThrow("does not match");
    });
  });
});
