import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const mockGetTransaction = jest.fn<any>();
const mockGetTransactionReceipt = jest.fn<any>();
const mockDecodeLog = jest.fn<any>();

jest.mock("@constants", () => ({
  ERC20_MANAGER_CONTRACT_ADDRESS: "0x1111111111111111111111111111111111111111",
  MIN_AMOUNT: 1,
}));
jest.mock("@contexts/Transfer/constants", () => ({
  SYSX_ASSET_GUID: "123",
}));
jest.mock("@contexts/Transfer/abi/SyscoinERC20Manager", () => [
  {
    type: "event",
    name: "TokenFreeze",
    inputs: [
      { indexed: true, name: "assetGuid", type: "uint256" },
      { indexed: true, name: "from", type: "address" },
      { indexed: false, name: "satoshiValue", type: "uint256" },
      { indexed: false, name: "syscoinAddr", type: "string" },
    ],
  },
]);
jest.mock("api/services/sponsor-wallet", () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock("api/services/transfer", () => ({
  TransferService: jest.fn(),
}));
jest.mock("lib/mongodb", () => jest.fn());
jest.mock("models/sponsor-rate-limit", () => ({
  __esModule: true,
  default: { updateOne: jest.fn() },
}));
jest.mock("utils/get-web3", () => ({
  __esModule: true,
  default: {
    eth: {
      abi: {
        decodeLog: mockDecodeLog,
        encodeEventSignature: jest.fn(() => "0xtokenfreeze"),
      },
      getTransaction: mockGetTransaction,
      getTransactionReceipt: mockGetTransactionReceipt,
    },
  },
}));

import { ETH_TO_SYS_TRANSFER_STATUS } from "@contexts/Transfer/types";
import { assertClaimGasEligible } from "pages/api/transfer/[id]/sponsor-claim-gas";

const managerAddress = "0x1111111111111111111111111111111111111111";
const nevmAddress = "0x2222222222222222222222222222222222222222";
const freezeBurnTxHash = `0x${"ab".repeat(32)}`;

const transfer = {
  id: "transfer-v2",
  type: "nevm-to-sys" as const,
  status: ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_FREEZE_BURN_SYS,
  amount: "1",
  logs: [
    {
      status: ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_FREEZE_BURN_SYS,
      payload: {
        message: "confirmed",
        data: { transactionHash: freezeBurnTxHash },
      },
      date: 1,
    },
  ],
  createdAt: 1,
  updatedAt: 1,
  utxoAddress: "sys1destination",
  nevmAddress,
  version: "v2" as const,
  agreedToTerms: true,
};

describe("foundation claim-gas V2 activation eligibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEVM_V2_ACTIVATION_BLOCK = "100";
    mockGetTransaction.mockResolvedValue({
      to: managerAddress,
      from: nevmAddress,
      value: "1000000000000000000",
    });
    mockGetTransactionReceipt.mockResolvedValue({
      blockNumber: 99,
      status: true,
      to: managerAddress,
      logs: [
        {
          address: managerAddress,
          topics: [
            "0xtokenfreeze",
            "0x7b",
            `0x${"0".repeat(24)}${nevmAddress.slice(2)}`,
          ],
          data: "0x",
        },
      ],
    });
    mockDecodeLog.mockReturnValue({
      satoshiValue: "100000000",
      syscoinAddr: "sys1destination",
    });
  });

  afterEach(() => {
    delete process.env.NEVM_V2_ACTIVATION_BLOCK;
  });

  it("rejects a genuine pre-activation TokenFreeze even when the row says v2", async () => {
    await expect(assertClaimGasEligible(transfer)).rejects.toThrow(
      "before the V2 activation block"
    );
  });

  it("accepts a matching event at the activation block regardless of its stored label", async () => {
    mockGetTransactionReceipt.mockResolvedValue({
      blockNumber: 100,
      status: true,
      to: managerAddress,
      logs: [
        {
          address: managerAddress,
          topics: [
            "0xtokenfreeze",
            "0x7b",
            `0x${"0".repeat(24)}${nevmAddress.slice(2)}`,
          ],
          data: "0x",
        },
      ],
    });

    await expect(
      assertClaimGasEligible({ ...transfer, version: "v1" })
    ).resolves.toEqual({
      blockNumber: 100,
      transactionHash: freezeBurnTxHash,
    });
  });

  it("fails closed when the activation block is unconfigured", async () => {
    delete process.env.NEVM_V2_ACTIVATION_BLOCK;

    await expect(assertClaimGasEligible(transfer)).rejects.toThrow(
      "NEVM V2 activation block is not configured"
    );
  });
});
