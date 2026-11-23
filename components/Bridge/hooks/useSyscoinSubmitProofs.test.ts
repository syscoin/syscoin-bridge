import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ITransfer, SYS_TO_ETH_TRANSFER_STATUS } from "@contexts/Transfer/types";

const mockGetWriteToken = jest.fn<(id: string) => string | undefined>();
const mockVerifyIntent = jest.fn<() => Promise<void>>();

jest.mock("utils/transfer-write-token", () => ({
  getTransferWriteToken: mockGetWriteToken,
}));
jest.mock("../transfer-signing-intent", () => ({
  ...jest.requireActual<typeof import("../transfer-signing-intent")>("../transfer-signing-intent"),
  verifyTransferSigningIntent: mockVerifyIntent,
}));
jest.mock("react-query", () => ({
  useMutation: (_key: unknown, mutationFn: () => Promise<string>) => mutationFn,
}));

import proofSponsorshipHook from "./useSyscoinSubmitProofs";
import { TransferSigningIntentError } from "../transfer-signing-intent";

const transfer: ITransfer = {
  id: "saved-transfer",
  type: "sys-to-nevm",
  version: "v2",
  status: SYS_TO_ETH_TRANSFER_STATUS.SUBMIT_PROOFS,
  amount: "0.5",
  nevmAddress: "0x1111111111111111111111111111111111111111",
  utxoAddress: "sys1qtrgef9gy95ree902dkltyt4vcku8sg8ank49zp",
  agreedToTerms: true,
  utxoAssetType: "sysx",
  logs: [],
  createdAt: 1,
};
const submit = () => (proofSponsorshipHook(transfer, jest.fn()) as unknown as () => Promise<string>)();

describe("proof sponsorship client authorization", () => {
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyIntent.mockResolvedValue(undefined);
    fetchMock = jest.spyOn(global, "fetch");
  });

  afterEach(() => { jest.restoreAllMocks(); });

  it.each(["original-transfer-token", undefined])("uses a same-origin POST with optional bearer (%s)", async (token) => {
    mockGetWriteToken.mockReturnValue(token);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ transaction: { hash: "0xproof" } }),
    } as Response);

    await expect(submit()).resolves.toBe("0xproof");

    expect(mockVerifyIntent).toHaveBeenCalledWith(transfer);
    expect(mockGetWriteToken).toHaveBeenCalledWith(transfer.id);
    expect(fetchMock).toHaveBeenCalledWith("/api/transfer/saved-transfer/signed-submit-proofs-tx", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  });

  it("stops if proof sponsorship no longer accepts the transfer credential", async () => {
    mockGetWriteToken.mockReturnValue("old-transfer-token");
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: "Transfer write is not authorized" }),
    } as Response);

    await expect(submit()).rejects.toBeInstanceOf(TransferSigningIntentError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
