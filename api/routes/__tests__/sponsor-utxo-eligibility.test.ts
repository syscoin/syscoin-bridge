import {
  ETH_TO_SYS_TRANSFER_STATUS,
  ITransfer,
} from "@contexts/Transfer/types";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockWeb3 = {
  eth: {
    abi: {
      encodeEventSignature: jest.fn(() => "0xfreeze"),
      decodeLog: jest.fn(() => ({
        satoshiValue: "10000000",
        syscoinAddr: "sys1destination",
      })),
    },
    getTransaction: jest.fn<any>(),
    getTransactionReceipt: jest.fn<any>(),
  },
};
const managerAddress = "0x2222222222222222222222222222222222222222";

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
        data: { transactionHash: "0xBURN" },
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
    mockWeb3.eth.getTransaction.mockResolvedValue({
      to: managerAddress,
      from: transfer.nevmAddress,
      value: "100000000000000000",
    });
    mockWeb3.eth.getTransactionReceipt.mockResolvedValue({
      blockNumber: 100,
      status: true,
      to: managerAddress,
      logs: [
        {
          address: managerAddress,
          topics: [
            "0xfreeze",
            `0x${BigInt(123456).toString(16).padStart(64, "0")}`,
            `0x${transfer.nevmAddress!.slice(2).padStart(64, "0")}`,
          ],
          data: "0x",
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
      transactionHash: "0xburn",
    });
  });

  it("rejects pre-activation mints", async () => {
    mockWeb3.eth.getTransactionReceipt.mockResolvedValueOnce({
      blockNumber: 99,
    });
    await expect(assertSponsoredMintEligible(transfer)).rejects.toThrow(
      "before the V2 activation block"
    );
  });
});
