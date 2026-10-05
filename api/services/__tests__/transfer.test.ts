import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const TransferModelMock = {
  create: jest.fn<any>(),
  findOne: jest.fn<any>(),
  findOneAndUpdate: jest.fn<any>(),
};
const mockAssertTransferCompleted = jest.fn<any>();
const mockCanonicalizeTransferProgress = jest.fn<any>();
const mockVerifiedTransferProgressStatus = jest.fn<any>();

jest.mock("../transfer-completion", () => ({
  assertTransferCompleted: mockAssertTransferCompleted,
}));
jest.mock("../transfer-progress", () => ({
  canonicalizeTransferProgress: mockCanonicalizeTransferProgress,
  verifiedTransferProgressStatus: mockVerifiedTransferProgressStatus,
}));

jest.mock("models/transfer", () => ({
  __esModule: true,
  default: TransferModelMock,
}));
jest.mock("../sponsor-wallet", () => ({
  SponsorWalletService: jest.fn().mockImplementation(() => ({
    updateSponsorWalletTransactionStatus: jest.fn(),
    updateUtxoSponsorWalletTransactionStatus: jest.fn(),
  })),
}));

import { createHash } from "crypto";
import {
  COMMON_STATUS,
  ETH_TO_SYS_TRANSFER_STATUS,
  ITransfer,
} from "@contexts/Transfer/types";
import {
  TransferNotFoundError,
  TransferService,
  TransferWriteUnauthorizedError,
  TransferWriteConflictError,
} from "../transfer";
import { TransferValidationError } from "../transfer-validation";

const transfer: ITransfer = {
  id: "e8d6267c-f818-41b3-9ee0-09b71179c438",
  type: "nevm-to-sys",
  status: ETH_TO_SYS_TRANSFER_STATUS.FREEZE_BURN_SYS,
  amount: "1",
  logs: [],
  createdAt: 1,
  utxoAddress: "sys1qtrgef9gy95ree902dkltyt4vcku8sg8ank49zp",
  nevmAddress: "0x1111111111111111111111111111111111111111",
  version: "v2",
  agreedToTerms: true,
};

const findExisting = (value: unknown) => {
  TransferModelMock.findOne.mockReturnValue({
    select: jest.fn<any>().mockResolvedValue(value),
  });
};

describe("TransferService write capabilities", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.IS_TESTNET = "false";
    mockAssertTransferCompleted.mockResolvedValue(undefined);
    mockCanonicalizeTransferProgress.mockImplementation(async (value: ITransfer) => value);
    mockVerifiedTransferProgressStatus.mockImplementation((value: ITransfer, prior?: ITransfer) =>
      value.status === COMMON_STATUS.ERROR ? prior?.status : value.status);
  });

  it("rejects updates to an existing transfer without its write token", async () => {
    findExisting({ ...transfer, writeTokenHash: "00".repeat(32) });

    await expect(
      new TransferService().upsertTransfer(transfer)
    ).rejects.toBeInstanceOf(TransferWriteUnauthorizedError);
    expect(TransferModelMock.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("throws a typed error when a transfer does not exist", async () => {
    TransferModelMock.findOne.mockResolvedValue(null);

    await expect(
      new TransferService().getTransfer("missing-transfer")
    ).rejects.toBeInstanceOf(TransferNotFoundError);
  });

  it("updates only the URL-bound transfer when the capability matches", async () => {
    const writeToken = "secret-capability";
    const writeTokenHash = createHash("sha256")
      .update(writeToken)
      .digest("hex");
    findExisting({ ...transfer, writeTokenHash });
    TransferModelMock.findOneAndUpdate.mockResolvedValue(transfer);

    await expect(
      new TransferService().upsertTransfer(transfer, writeToken)
    ).resolves.toEqual({ transfer, writeToken });
    expect(TransferModelMock.findOneAndUpdate).toHaveBeenCalledWith(
      { id: transfer.id, writeTokenHash, __v: { $exists: false } },
      expect.objectContaining({
        $set: expect.not.objectContaining({
          id: expect.anything(),
          version: expect.anything(),
          writeTokenHash: expect.anything(),
        }),
      }),
      { new: true }
    );
    expect(mockCanonicalizeTransferProgress).toHaveBeenCalledWith(transfer, transfer);
  });

  it("returns a transfer only when its capability matches", async () => {
    const writeToken = "secret-capability";
    const writeTokenHash = createHash("sha256")
      .update(writeToken)
      .digest("hex");
    findExisting({ ...transfer, writeTokenHash });

    await expect(
      new TransferService().getAuthorizedTransfer(transfer.id, writeToken)
    ).resolves.toEqual(transfer);
    expect(TransferModelMock.findOne).toHaveBeenCalledWith({
      id: { $eq: transfer.id },
    });
  });

  it("accepts the original backup capability when a replacement bearer token is wrong", async () => {
    const writeToken = "original-capability";
    const writeTokenHash = createHash("sha256")
      .update(writeToken)
      .digest("hex");
    findExisting({ ...transfer, writeTokenHash });
    TransferModelMock.findOneAndUpdate.mockResolvedValue(transfer);

    await expect(
      new TransferService().upsertTransfer(transfer, [
        "replacement-capability",
        writeToken,
      ])
    ).resolves.toEqual({ transfer, writeToken });
  });

  it("rejects sponsored actions without the transfer capability", async () => {
    findExisting({ ...transfer, writeTokenHash: "00".repeat(32) });

    await expect(
      new TransferService().getAuthorizedTransfer(transfer.id)
    ).rejects.toBeInstanceOf(TransferWriteUnauthorizedError);
  });

  it("rejects malformed legacy account data before authorizing sponsorship", async () => {
    const writeToken = "secret-capability";
    findExisting({ ...transfer, utxoXpub: "../../../api/status",
      writeTokenHash: createHash("sha256").update(writeToken).digest("hex") });
    await expect(new TransferService().getAuthorizedTransfer(transfer.id, writeToken))
      .rejects.toBeInstanceOf(TransferValidationError);
  });

  it("binds a new record to the supplied capability and forces V2", async () => {
    findExisting(null);
    TransferModelMock.create.mockImplementation(async (value: any) => value);

    const result = await new TransferService().upsertTransfer({
      ...transfer,
      version: "v1",
    }, "new-transfer-capability");

    expect(result.transfer.version).toBe("v2");
    expect(result.writeToken).toBe("new-transfer-capability");
    expect(result.transfer).not.toHaveProperty("writeTokenHash");
    expect(TransferModelMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: transfer.id,
        version: "v2",
        writeTokenHash: expect.any(String),
      })
    );
  });

  it("does not create a transfer without a capability", async () => {
    findExisting(null);

    await expect(
      new TransferService().upsertTransfer(transfer)
    ).rejects.toBeInstanceOf(TransferWriteUnauthorizedError);
    expect(TransferModelMock.create).not.toHaveBeenCalled();
  });

  it("rejects creation already marked completed even with a caller's capability", async () => {
    findExisting(null);

    await expect(new TransferService().upsertTransfer({
      ...transfer, status: COMMON_STATUS.COMPLETED,
    }, "attacker-capability")).rejects.toBeInstanceOf(TransferValidationError);
    expect(TransferModelMock.create).not.toHaveBeenCalled();
  });

  it("does not persist completed status when chain verification fails", async () => {
    const writeToken = "secret-capability";
    findExisting({ ...transfer, writeTokenHash: createHash("sha256").update(writeToken).digest("hex") });
    const error = new TransferValidationError("Settlement transaction does not match this transfer");
    mockAssertTransferCompleted.mockRejectedValueOnce(error);
    const completed = { ...transfer, status: COMMON_STATUS.COMPLETED };

    await expect(new TransferService().upsertTransfer(completed, writeToken)).rejects.toBe(error);
    expect(mockAssertTransferCompleted).toHaveBeenCalledWith(completed);
    expect(TransferModelMock.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("revalidates completion on retries instead of trusting stored status", async () => {
    const writeToken = "secret-capability";
    const completed = { ...transfer, status: COMMON_STATUS.COMPLETED };
    findExisting({ ...completed, writeTokenHash: createHash("sha256").update(writeToken).digest("hex") });
    TransferModelMock.findOneAndUpdate.mockResolvedValue(completed);

    await expect(new TransferService().upsertTransfer(completed, writeToken)).resolves.toEqual({transfer: completed, writeToken});
    expect(mockAssertTransferCompleted).toHaveBeenCalledWith(completed);
  });

  it("rejects changing the amount even when the write capability matches", async () => {
    const writeToken = "secret-capability";
    findExisting({ ...transfer, writeTokenHash: createHash("sha256").update(writeToken).digest("hex") });

    await expect(new TransferService().upsertTransfer({ ...transfer, amount: "1000000" }, writeToken)).rejects.toBeInstanceOf(TransferValidationError);
    expect(TransferModelMock.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("does not persist intermediate progress rejected by chain validation", async () => {
    const writeToken = "secret-capability";
    findExisting({ ...transfer, writeTokenHash: createHash("sha256").update(writeToken).digest("hex") });
    const error = new TransferValidationError("Freeze transaction does not match this transfer");
    mockCanonicalizeTransferProgress.mockRejectedValueOnce(error);
    await expect(new TransferService().upsertTransfer(transfer, writeToken)).rejects.toBe(error);
    expect(TransferModelMock.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("persists canonical evidence rather than the client-reported payload", async () => {
    const writeToken = "secret-capability";
    const writeTokenHash = createHash("sha256").update(writeToken).digest("hex");
    findExisting({ ...transfer, writeTokenHash, __v: 3 });
    const canonical = { ...transfer, logs: [{ status: transfer.status, date: 1,
      payload: { message: "transaction", data: { hash: `0x${"a".repeat(64)}` } } }] };
    mockCanonicalizeTransferProgress.mockResolvedValueOnce(canonical);
    TransferModelMock.findOneAndUpdate.mockResolvedValue(canonical);
    await expect(new TransferService().upsertTransfer(transfer, writeToken)).resolves.toEqual({ transfer: canonical, writeToken });
    expect(TransferModelMock.findOneAndUpdate).toHaveBeenCalledWith(
      { id: transfer.id, writeTokenHash, __v: 3 },
      { $set: expect.objectContaining({ logs: canonical.logs }), $inc: { __v: 1 } }, { new: true }
    );
  });

  it("rejects a concurrent update rather than overwriting its history", async () => {
    const writeToken = "secret-capability";
    findExisting({ ...transfer, writeTokenHash: createHash("sha256").update(writeToken).digest("hex"), __v: 3 });
    TransferModelMock.findOneAndUpdate.mockResolvedValueOnce(null);
    await expect(new TransferService().upsertTransfer(transfer, writeToken)).rejects.toBeInstanceOf(TransferWriteConflictError);
  });

  it("retains a server-owned progress checkpoint across error states", async () => {
    const writeToken = "secret-capability";
    const priorStatus = ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_BURN_SYSX;
    findExisting({ ...transfer, status: COMMON_STATUS.ERROR, progressStatus: priorStatus,
      writeTokenHash: createHash("sha256").update(writeToken).digest("hex") });
    const errorTransfer = { ...transfer, status: COMMON_STATUS.ERROR };
    TransferModelMock.findOneAndUpdate.mockResolvedValue({ ...errorTransfer, progressStatus: priorStatus });

    const result = await new TransferService().upsertTransfer(errorTransfer, writeToken);

    expect(mockCanonicalizeTransferProgress).toHaveBeenCalledWith(errorTransfer,
      { ...transfer, status: priorStatus });
    const update = TransferModelMock.findOneAndUpdate.mock.calls[0][1] as { $set: { progressStatus: unknown } };
    expect(update.$set.progressStatus).toBe(priorStatus);
    expect(result.transfer).not.toHaveProperty("progressStatus");
  });

  it("does not trust a checkpoint supplied by the client", async () => {
    const writeToken = "secret-capability";
    findExisting({ ...transfer, progressStatus: transfer.status,
      writeTokenHash: createHash("sha256").update(writeToken).digest("hex") });
    const supplied = { ...transfer, progressStatus: COMMON_STATUS.COMPLETED };
    TransferModelMock.findOneAndUpdate.mockResolvedValue(transfer);
    await new TransferService().upsertTransfer(supplied, writeToken);
    const update = TransferModelMock.findOneAndUpdate.mock.calls[0][1] as { $set: { progressStatus: unknown } };
    expect(update.$set.progressStatus).toBe(transfer.status);
  });
});
