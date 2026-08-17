import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const TransferModelMock = {
  create: jest.fn<any>(),
  findOne: jest.fn<any>(),
  findOneAndUpdate: jest.fn<any>(),
};

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
  ETH_TO_SYS_TRANSFER_STATUS,
  ITransfer,
} from "@contexts/Transfer/types";
import {
  TransferNotFoundError,
  TransferService,
  TransferWriteUnauthorizedError,
} from "../transfer";

const transfer: ITransfer = {
  id: "transfer-id",
  type: "nevm-to-sys",
  status: ETH_TO_SYS_TRANSFER_STATUS.FREEZE_BURN_SYS,
  amount: "1",
  logs: [],
  createdAt: 1,
  utxoAddress: "sys1destination",
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
      { id: transfer.id, writeTokenHash },
      expect.objectContaining({
        $set: expect.not.objectContaining({
          id: expect.anything(),
          version: expect.anything(),
          writeTokenHash: expect.anything(),
        }),
      }),
      { new: true }
    );
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
});
