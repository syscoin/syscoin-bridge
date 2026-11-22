import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ITransfer, SYS_TO_ETH_TRANSFER_STATUS } from "@contexts/Transfer/types";

const mockGetToken = jest.fn<(id: string) => string | undefined>();
const mockSendTransaction = jest.fn<() => Promise<{ tx: string }>>();
const mockBuildBurn = jest.fn<() => Promise<{ psbt: string }>>();

jest.mock("utils/transfer-write-token", () => ({
  getTransferWriteToken: mockGetToken,
}));
jest.mock("@contexts/PaliWallet/usePaliWallet", () => ({
  usePaliWalletV2: () => ({ sendTransaction: mockSendTransaction }),
}));
jest.mock("@contexts/Transfer/functions/burnSysx", () => ({
  __esModule: true,
  default: mockBuildBurn,
}));
jest.mock("./context/Syscoin", () => ({ useSyscoin: () => "syscoin" }));
jest.mock("./hooks/useFeatureFlags", () => ({
  useFeatureFlags: () => ({ isEnabled: () => false }),
}));
jest.mock("react-query", () => ({
  useMutation: (_key: unknown, options: unknown) => options,
}));

import { useBurnSysx as burnSysxHook } from "./hooks/useBurnSysx";
import {
  TransferSigningIntentError,
  verifyTransferSigningIntent,
} from "./transfer-signing-intent";

const publicTransfer: ITransfer = {
  id: "saved-transfer",
  type: "sys-to-nevm",
  version: "v2",
  status: SYS_TO_ETH_TRANSFER_STATUS.BURN_SYSX,
  amount: "0.50000000",
  nevmAddress: "0x111111111111111111111111111111111111ABCD",
  utxoAddress: "sys1qtrgef9gy95ree902dkltyt4vcku8sg8ank49zp",
  agreedToTerms: true,
  utxoAssetType: "sysx",
  logs: [],
  createdAt: 1,
};
const authorizedTransfer = {
  ...publicTransfer,
  amount: "0.5",
  nevmAddress: publicTransfer.nevmAddress!.toLowerCase(),
  utxoXpub: "saved-account",
};
const response = (value: unknown, status = 200) => ({
  ok: status === 200,
  status,
  json: async () => value,
} as Response);

const runBurn = () =>
  (burnSysxHook(publicTransfer) as unknown as {
    mutationFn: () => Promise<string>;
  }).mutationFn();

describe("transfer signing intent", () => {
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.spyOn(global, "fetch");
    mockGetToken.mockReturnValue(undefined);
    mockBuildBurn.mockResolvedValue({ psbt: "prepared-burn" });
    mockSendTransaction.mockResolvedValue({ tx: "transaction-id" });
  });

  afterEach(() => { jest.restoreAllMocks(); });

  it.each([undefined, "saved-capability"])("uses the same-origin cookie and optional bearer (%s)", async (token) => {
    mockGetToken.mockReturnValue(token);
    fetchMock.mockResolvedValue(response(authorizedTransfer));

    await expect(verifyTransferSigningIntent(publicTransfer))
      .resolves.toEqual(authorizedTransfer);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/transfer/saved-transfer/signing-intent",
      {
        cache: "no-store",
        credentials: "same-origin",
        redirect: "error",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    );
  });

  it.each([
    { id: "another-transfer" },
    { type: "nevm-to-sys" },
    { amount: "0.50000001" },
    { nevmAddress: "0x2222222222222222222222222222222222222222" },
    { utxoAddress: "different-source" },
    { utxoAssetType: "sys" },
    { status: "confirm-burn-sysx" },
  ])("blocks wallet preparation when the saved intent differs (%j)", async (change) => {
    fetchMock.mockResolvedValue(response({ ...authorizedTransfer, ...change }));

    await expect(runBurn()).rejects.toBeInstanceOf(TransferSigningIntentError);
    expect(mockBuildBurn).not.toHaveBeenCalled();
    expect(mockSendTransaction).not.toHaveBeenCalled();
  });

  it("blocks wallet actions when the current browser has no valid capability", async () => {
    fetchMock.mockResolvedValue(response({}, 401));

    await expect(runBurn()).rejects.toThrow("browser where it was started");
    expect(mockBuildBurn).not.toHaveBeenCalled();
    expect(mockSendTransaction).not.toHaveBeenCalled();
  });

  it("rechecks the saved account and stage after building the transaction", async () => {
    fetchMock.mockResolvedValueOnce(response(authorizedTransfer));
    fetchMock.mockResolvedValueOnce(response({
      ...authorizedTransfer,
      utxoXpub: "different-account",
    }));

    await expect(runBurn()).rejects.toThrow("Transfer details changed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mockBuildBurn).toHaveBeenCalledTimes(1);
    expect(mockSendTransaction).not.toHaveBeenCalled();
  });

  it("uses the authorized recipient and private account for an unchanged transfer", async () => {
    fetchMock.mockResolvedValue(response(authorizedTransfer));

    await expect(runBurn()).resolves.toBe("transaction-id");
    expect(mockBuildBurn).toHaveBeenCalledWith(
      "syscoin",
      authorizedTransfer.amount,
      expect.any(String),
      authorizedTransfer.utxoAddress,
      authorizedTransfer.utxoXpub,
      authorizedTransfer.nevmAddress.slice(2)
    );
    expect(mockSendTransaction).toHaveBeenCalledWith({ psbt: "prepared-burn" });
  });
});
