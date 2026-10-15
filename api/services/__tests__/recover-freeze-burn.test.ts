import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import Web3 from "web3";
import managerAbi from "@contexts/Transfer/abi/SyscoinERC20Manager";
import { SYSX_ASSET_GUID } from "@contexts/Transfer/constants";
import { ITransfer } from "@contexts/Transfer/types";
import { createHash } from "crypto";

const mockWeb3 = { eth: { abi: new Web3().eth.abi,
  getTransaction: jest.fn<any>(), getTransactionReceipt: jest.fn<any>(),
  getChainId: jest.fn<any>(), getBlock: jest.fn<any>() } };
const mockModel = { findOne: jest.fn<any>(), findOneAndUpdate: jest.fn<any>(), find: jest.fn<any>() };
jest.mock("utils/get-web3", () => ({ __esModule: true, default: mockWeb3 }));
jest.mock("models/transfer", () => ({ __esModule: true, default: mockModel }));
jest.mock("../sponsor-wallet", () => ({ SponsorWalletService: jest.fn().mockImplementation(() => ({
  updateSponsorWalletTransactionStatus: jest.fn(), updateUtxoSponsorWalletTransactionStatus: jest.fn(),
})) }));
jest.mock("@constants", () => ({ ERC20_MANAGER_CONTRACT_ADDRESS: "0x2222222222222222222222222222222222222222", MIN_AMOUNT: 0.01 }));

import { TransferService, TransferWriteConflictError, TransferWriteUnauthorizedError } from "../transfer";
import { getVerifiedFreezeBurnReceipt } from "../sponsor-utxo-eligibility";
import { TransferValidationError } from "../transfer-validation";

const manager = "0x2222222222222222222222222222222222222222";
const owner = "0x1111111111111111111111111111111111111111";
const hash = `0x${"a".repeat(64)}`, blockHash = `0x${"b".repeat(64)}`;
const token = "recovery-capability", tokenHash = createHash("sha256").update(token).digest("hex");
const transfer: ITransfer = {
  id: "e8d6267c-f818-41b3-9ee0-09b71179c438", type: "nevm-to-sys", version: "v2",
  status: "freeze-burn-sys" as ITransfer["status"], amount: "1", createdAt: 1, logs: [],
  utxoAddress: "sys1qtrgef9gy95ree902dkltyt4vcku8sg8ank49zp", nevmAddress: owner,
  agreedToTerms: true, useSysx: false, utxoAssetType: "sys",
};
const freeze = () => ({ hash, from: owner, to: manager, value: "1000000000000000000",
  blockHash, blockNumber: 100, transactionIndex: 2,
  input: mockWeb3.eth.abi.encodeFunctionCall(managerAbi.find((v) => v.name === "freezeBurn")!,
    ["1000000000000000000", "0x0000000000000000000000000000000000000000", "0", transfer.utxoAddress!]),
});
const receipt = (amount = "100000000", recipient = transfer.utxoAddress!, asset = SYSX_ASSET_GUID) => ({
  transactionHash: hash, status: true, to: manager, from: owner, blockHash, blockNumber: 100, transactionIndex: 2,
  logs: [{ address: manager, topics: [
    mockWeb3.eth.abi.encodeEventSignature(managerAbi.find((v) => v.name === "TokenFreeze")!),
    mockWeb3.eth.abi.encodeParameter("uint64", asset), mockWeb3.eth.abi.encodeParameter("address", owner),
  ], data: mockWeb3.eth.abi.encodeParameters(["uint256", "string"], [amount, recipient]) }],
});
let stored: any;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
beforeEach(() => {
  jest.clearAllMocks(); process.env.IS_TESTNET = "false";
  stored = { ...transfer, logs: [], writeTokenHash: tokenHash, __v: 3, progressStatus: transfer.status };
  mockModel.findOne.mockImplementation(() => ({ select: async () => clone(stored) }));
  mockModel.find.mockImplementation(() => ({ select: () => ({ sort: async () => [clone(stored)] }) }));
  mockModel.findOneAndUpdate.mockImplementation(async (filter: any, update: any) => {
    if (filter.__v !== stored.__v) return null;
    stored = { ...stored, ...update.$set, __v: stored.__v + 1 };
    return clone(stored);
  });
  mockWeb3.eth.getTransaction.mockResolvedValue(freeze());
  mockWeb3.eth.getTransactionReceipt.mockResolvedValue(receipt());
  mockWeb3.eth.getChainId.mockResolvedValue(57);
  mockWeb3.eth.getBlock.mockResolvedValue({ number: 100, hash: blockHash, transactions: [blockHash, blockHash, hash] });
});

describe("capability-authorized existing freeze recovery", () => {
  it("records only verified canonical evidence and advances through the normal CAS writer", async () => {
    const result = await new TransferService().recoverFreezeBurn(transfer.id, hash.toUpperCase().replace("0X", "0x"), token);
    expect(result.status).toBe("mint-sysx");
    expect(result.logs.map((log) => log.status)).toEqual(["freeze-burn-sys", "confirm-freeze-burn-sys"]);
    expect(result.logs[0].payload.data).toEqual({ hash });
    expect(result.logs[1].payload.data).toEqual(receipt());
    expect(result).not.toHaveProperty("writeTokenHash");
    expect(mockModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(mockModel.findOneAndUpdate.mock.calls[0][0]).toEqual({ id: transfer.id, writeTokenHash: tokenHash, __v: 3 });
    expect(mockWeb3.eth.getTransaction.mock.calls.every(([value]) => value === hash)).toBe(true);
  });
  it.each([undefined, "wrong-capability"])("refuses unauthorized recovery before chain reads", async (capability) => {
    await expect(new TransferService().recoverFreezeBurn(transfer.id, hash, capability)).rejects.toBeInstanceOf(TransferWriteUnauthorizedError);
    expect(mockWeb3.eth.getTransaction).not.toHaveBeenCalled();
    expect(mockModel.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it("is idempotent after recovery and does not reset later progress or add dates/logs", async () => {
    const service = new TransferService(); await service.recoverFreezeBurn(transfer.id, hash, token);
    stored.status = "completed"; const snapshot = clone(stored);
    jest.clearAllMocks();
    const result = await service.recoverFreezeBurn(transfer.id, hash, token);
    expect(result.status).toBe("completed"); expect(stored).toEqual(snapshot);
    expect(mockModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(mockWeb3.eth.getTransaction).not.toHaveBeenCalled();
  });
  it("recovers an early persisted error at the freeze checkpoint", async () => {
    stored.status = "error";
    const result = await new TransferService().recoverFreezeBurn(transfer.id, hash, token);
    expect(result.status).toBe("mint-sysx");
    expect(result.logs).toHaveLength(2);
  });
  it.each(["confirm-mint-sysx", "burn-sysx", "confirm-burn-sysx", "finalizing", "completed"])(
    "keeps a repeated recovery at the server-owned %s error checkpoint", async (checkpoint) => {
      const service = new TransferService();
      await service.recoverFreezeBurn(transfer.id, hash, token);
      stored.status = "error"; stored.progressStatus = checkpoint;
      const snapshot = clone(stored);
      jest.clearAllMocks();
      const result = await service.recoverFreezeBurn(transfer.id, hash, token);
      expect(result.status).toBe(checkpoint);
      expect(stored).toEqual(snapshot);
      expect(result).not.toHaveProperty("progressStatus");
      expect(mockModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(mockWeb3.eth.getTransaction).not.toHaveBeenCalled();
    }
  );
  it("returns the later error checkpoint on a public read without leaking hidden state", async () => {
    stored.status = "error"; stored.progressStatus = "burn-sysx";
    mockModel.findOne.mockReturnValue({ select: async () => clone(stored) });
    const value = await new TransferService().getTransfer(transfer.id);
    expect(value.status).toBe("burn-sysx");
    expect(value).not.toHaveProperty("progressStatus");
    expect(value).not.toHaveProperty("writeTokenHash");
  });
  it("projects list and authorized reads from hidden progress when logs still reflect only freeze", async () => {
    const service = new TransferService(); await service.recoverFreezeBurn(transfer.id, hash, token);
    stored.status = "error"; stored.progressStatus = "burn-sysx";
    for (const value of [await service.getAuthorizedTransfer(transfer.id, token),
      ...(await service.getAll({ nevmAddress: owner }))]) {
      expect(value.status).toBe("burn-sysx");
      expect(value.logs.map((log) => log.status)).toEqual(["freeze-burn-sys", "confirm-freeze-burn-sys"]);
      expect(value).not.toHaveProperty("progressStatus");
      expect(value).not.toHaveProperty("writeTokenHash");
      expect(value).not.toHaveProperty("__v");
    }
    expect(stored.status).toBe("error");
  });
  it("derives later continuation from stored logs for records predating hidden checkpoints", async () => {
    const service = new TransferService(); await service.recoverFreezeBurn(transfer.id, hash, token);
    stored.status = "error"; delete stored.progressStatus;
    stored.logs.push({ status: "mint-sysx", date: 3, payload: { message: "Mint", data: { tx: "c".repeat(64) } } });
    const snapshot = clone(stored);
    expect((await service.recoverFreezeBurn(transfer.id, hash, token)).status).toBe("confirm-mint-sysx");
    expect(stored).toEqual(snapshot);
  });
  it("preserves prior error history", async () => {
    stored.logs.push({ status: "freeze-burn-sys", date: 1, payload: { message: "Failed", data: { error: "RPC disconnected" } } });
    const first = clone(stored.logs[0]);
    const result = await new TransferService().recoverFreezeBurn(transfer.id, hash, token);
    expect(result.logs).toHaveLength(3); expect(result.logs[0]).toEqual(first);
  });
  it("refuses a conflicting already-recorded original", async () => {
    stored.logs.push({ status: "freeze-burn-sys", date: 1, payload: { message: "Existing", data: { hash: `0x${"c".repeat(64)}` } } });
    await expect(new TransferService().recoverFreezeBurn(transfer.id, hash, token)).rejects.toBeInstanceOf(TransferWriteConflictError);
    expect(mockModel.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it("fails closed on a concurrent version change", async () => {
    mockModel.findOneAndUpdate.mockResolvedValueOnce(null);
    await expect(new TransferService().recoverFreezeBurn(transfer.id, hash, token)).rejects.toBeInstanceOf(TransferWriteConflictError);
  });
  it("refuses malformed hashes and another route without writing", async () => {
    const service = new TransferService();
    await expect(service.recoverFreezeBurn(transfer.id, "not-a-hash", token)).rejects.toBeInstanceOf(TransferValidationError);
    stored.type = "sys-to-nevm"; stored.status = "burn-sys";
    await expect(service.recoverFreezeBurn(transfer.id, hash, token)).rejects.toBeInstanceOf(TransferValidationError);
    expect(mockModel.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it.each([
    ["pending", () => mockWeb3.eth.getTransactionReceipt.mockResolvedValue(null)],
    ["failed", () => mockWeb3.eth.getTransactionReceipt.mockResolvedValue({ ...receipt(), status: false })],
    ["wrong sender", () => mockWeb3.eth.getTransaction.mockResolvedValue({ ...freeze(), from: manager })],
    ["wrong value", () => mockWeb3.eth.getTransaction.mockResolvedValue({ ...freeze(), value: "1" })],
    ["wrong manager", () => mockWeb3.eth.getTransaction.mockResolvedValue({ ...freeze(), to: owner })],
    ["wrong recipient", () => mockWeb3.eth.getTransactionReceipt.mockResolvedValue(receipt("100000000", "other"))],
    ["wrong amount", () => mockWeb3.eth.getTransactionReceipt.mockResolvedValue(receipt("1"))],
    ["wrong asset", () => mockWeb3.eth.getTransactionReceipt.mockResolvedValue(receipt("100000000", transfer.utxoAddress!, "999"))],
    ["wrong hash", () => mockWeb3.eth.getTransactionReceipt.mockResolvedValue({ ...receipt(), transactionHash: blockHash })],
    ["different block", () => mockWeb3.eth.getTransaction.mockResolvedValue({ ...freeze(), blockHash: hash })],
    ["missing block", () => mockWeb3.eth.getTransaction.mockResolvedValue({ ...freeze(), blockNumber: null })],
    ["wrong call", () => mockWeb3.eth.getTransaction.mockResolvedValue({ ...freeze(), input: "0x12345678" })],
    ["wrong chain", () => mockWeb3.eth.getChainId.mockResolvedValue(5700)],
    ["orphaned block", () => mockWeb3.eth.getBlock.mockResolvedValue({ number: 100, hash, transactions: [blockHash, blockHash, hash] })],
    ["wrong block number", () => mockWeb3.eth.getBlock.mockResolvedValue({ number: 99, hash: blockHash, transactions: [blockHash, blockHash, hash] })],
    ["missing canonical membership", () => mockWeb3.eth.getBlock.mockResolvedValue({ number: 100, hash: blockHash, transactions: [] })],
    ["wrong transaction index", () => mockWeb3.eth.getBlock.mockResolvedValue({ number: 100, hash: blockHash, transactions: [hash] })],
  ] as [string, () => void][])("rejects %s evidence before persistence", async (_name, change) => {
    change();
    await expect(new TransferService().recoverFreezeBurn(transfer.id, hash, token)).rejects.toBeInstanceOf(TransferValidationError);
    expect(mockModel.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it("keeps the shared mint verifier bound to the supplied canonical hash", async () => {
    mockWeb3.eth.getTransaction.mockResolvedValue({ ...freeze(), hash: blockHash });
    await expect(getVerifiedFreezeBurnReceipt(transfer, hash)).rejects.toThrow("does not match");
  });
});
