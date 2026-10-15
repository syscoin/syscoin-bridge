import {
  ETH_TO_SYS_TRANSFER_STATUS,
  ITransfer,
} from "@contexts/Transfer/types";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import Web3 from "web3";
import managerAbi from "@contexts/Transfer/abi/SyscoinERC20Manager";

const mockWeb3 = {
  eth: {
    abi: new Web3().eth.abi,
    getTransaction: jest.fn<any>(),
    getTransactionReceipt: jest.fn<any>(),
    getChainId: jest.fn<any>().mockResolvedValue(57),
    getBlock: jest.fn<any>(),
  },
};
const managerAddress = "0x2222222222222222222222222222222222222222";
const txHash = `0x${"a".repeat(64)}`, blockHash = `0x${"b".repeat(64)}`;

jest.mock("@constants", () => ({
  ERC20_MANAGER_CONTRACT_ADDRESS:
    "0x2222222222222222222222222222222222222222",
  MIN_AMOUNT: 0.01,
}));

jest.mock("utils/get-web3", () => ({
  __esModule: true,
  default: mockWeb3,
}));

import {
  assertFreezeBurnMatchesTransfer,
  assertSponsoredMintEligible,
  assertSponsoredUtxoTransfer,
} from "api/services/sponsor-utxo-eligibility";

const transfer: ITransfer = {
  id: "transfer-1",
  type: "nevm-to-sys",
  status: ETH_TO_SYS_TRANSFER_STATUS.MINT_SYSX,
  amount: "0.1",
  logs: [
    {
      date: 1,
      status: ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_FREEZE_BURN_SYS,
      payload: {
        message: "confirmed",
        data: { transactionHash: txHash },
      },
    },
  ],
  createdAt: 1,
  utxoAddress: "sys1destination",
  utxoXpub: "xpub",
  nevmAddress: "0x1111111111111111111111111111111111111111",
  version: "v2",
  agreedToTerms: true,
};

describe("sponsored UTXO eligibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEVM_V2_ACTIVATION_BLOCK = "100";
    mockWeb3.eth.getBlock.mockImplementation(async (number: number) => ({ number, hash: blockHash, transactions: [txHash] }));
    mockWeb3.eth.getTransaction.mockResolvedValue({
      hash: txHash, blockHash, blockNumber: 100, transactionIndex: 0,
      to: managerAddress,
      from: transfer.nevmAddress,
      value: "100000000000000000",
      input: mockWeb3.eth.abi.encodeFunctionCall(managerAbi.find((item) => item.name === "freezeBurn")!,
        ["100000000000000000", "0x0000000000000000000000000000000000000000", "0", transfer.utxoAddress!]),
    });
    mockWeb3.eth.getTransactionReceipt.mockResolvedValue({
      blockNumber: 100,
      transactionHash: txHash, blockHash, transactionIndex: 0,
      status: true,
      to: managerAddress,
      logs: [
        {
          address: managerAddress,
          topics: [
            mockWeb3.eth.abi.encodeEventSignature(managerAbi.find((item) => item.name === "TokenFreeze")!),
            `0x${BigInt(123456).toString(16).padStart(64, "0")}`,
            `0x${transfer.nevmAddress!.slice(2).padStart(64, "0")}`,
          ],
          data: mockWeb3.eth.abi.encodeParameters(["uint256", "string"], ["10000000", transfer.utxoAddress!]),
        },
      ],
    });
  });

  it("requires V2 and complete transfer addresses", () => {
    expect(() => assertSponsoredUtxoTransfer(transfer)).not.toThrow();
    expect(() =>
      assertSponsoredUtxoTransfer({ ...transfer, version: "v1" })
    ).toThrow("only available for V2");
  });

  it("accepts a matching confirmed freeze burn", async () => {
    await expect(assertSponsoredMintEligible(transfer)).resolves.toEqual({
      blockNumber: 100,
      transactionHash: txHash,
    });
  });

  it("rejects pre-activation mints", async () => {
    const receipt = await mockWeb3.eth.getTransactionReceipt();
    const transaction = await mockWeb3.eth.getTransaction();
    mockWeb3.eth.getTransaction.mockResolvedValueOnce({ ...transaction, blockNumber: 99 });
    mockWeb3.eth.getTransactionReceipt.mockResolvedValueOnce({ ...receipt, blockNumber: 99 });
    await expect(assertSponsoredMintEligible(transfer)).rejects.toThrow(
      "before the V2 activation block"
    );
  });

  it("verifies self-funded completion without sponsorship configuration or an xpub", async () => {
    delete process.env.NEVM_V2_ACTIVATION_BLOCK;
    await expect(assertFreezeBurnMatchesTransfer({ ...transfer, utxoXpub: undefined })).resolves.toEqual({
      blockNumber: 100,
      transactionHash: txHash,
    });
    await expect(assertSponsoredMintEligible(transfer)).rejects.toThrow("V2 activation block is not configured");
  });
});
