import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const collection: any = {
  indexes: jest.fn(),
  dropIndex: jest.fn(),
};
const sponsorWalletTransactions: any = {
  collection,
  createIndexes: jest.fn(),
  countDocuments: jest.fn(),
  aggregate: jest.fn(),
};
const sponsorUtxoReservation: any = {
  createIndexes: jest.fn(),
};
const transferModel: any = {
  aggregate: jest.fn(),
  createIndexes: jest.fn(),
};

jest.mock("../sponsor-wallet-transactions", () => ({
  __esModule: true,
  default: sponsorWalletTransactions,
}));
jest.mock("../sponsor-utxo-reservation", () => ({
  __esModule: true,
  default: sponsorUtxoReservation,
}));
jest.mock("../transfer", () => ({
  __esModule: true,
  default: transferModel,
}));

import { ensureSponsorIndexes } from "../ensure-sponsor-indexes";

describe("ensureSponsorIndexes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.FOUNDATION_FUNDED;
    delete process.env.NEVM_V2_ACTIVATION_BLOCK;
    sponsorWalletTransactions.countDocuments.mockResolvedValue(0);
    sponsorWalletTransactions.aggregate.mockResolvedValue([]);
    collection.indexes.mockResolvedValue([]);
    sponsorWalletTransactions.createIndexes.mockResolvedValue(undefined);
    sponsorUtxoReservation.createIndexes.mockResolvedValue(undefined);
    transferModel.aggregate.mockResolvedValue([]);
    transferModel.createIndexes.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.FOUNDATION_FUNDED;
    delete process.env.NEVM_V2_ACTIVATION_BLOCK;
  });

  it("ignores a legacy index already dropped by another cold start", async () => {
    collection.indexes.mockResolvedValue([
      { name: "_id_", key: { _id: 1 } },
      {
        name: "action_1_sourceTxHash_1",
        key: { action: 1, sourceTxHash: 1 },
      },
    ]);
    collection.dropIndex.mockRejectedValue({
      code: 27,
      codeName: "IndexNotFound",
    });

    await expect(ensureSponsorIndexes()).resolves.toBeUndefined();

    expect(collection.dropIndex).toHaveBeenCalledWith(
      "action_1_sourceTxHash_1"
    );
    expect(sponsorWalletTransactions.createIndexes).toHaveBeenCalledTimes(1);
    expect(sponsorUtxoReservation.createIndexes).toHaveBeenCalledTimes(1);
    expect(transferModel.createIndexes).toHaveBeenCalledTimes(1);
  });

  it("does not hide unexpected index cleanup failures", async () => {
    const databaseError = { code: 13, codeName: "Unauthorized" };
    collection.indexes.mockResolvedValue([
      {
        name: "action_1_sourceTxHash_1",
        key: { action: 1, sourceTxHash: 1 },
      },
    ]);
    collection.dropIndex.mockRejectedValue(databaseError);

    await expect(ensureSponsorIndexes()).rejects.toBe(databaseError);
    expect(sponsorWalletTransactions.createIndexes).not.toHaveBeenCalled();
  });

  it("blocks foundation funding until legacy signed rows are reconciled", async () => {
    process.env.FOUNDATION_FUNDED = "true";
    process.env.NEVM_V2_ACTIVATION_BLOCK = "100";
    sponsorWalletTransactions.countDocuments.mockResolvedValue(1);

    await expect(ensureSponsorIndexes()).rejects.toThrow(
      "Foundation funding V2 cutover blocked"
    );

    expect(sponsorWalletTransactions.countDocuments).toHaveBeenCalledWith({
      "transaction.rawData": { $type: "string" },
      "transaction.nonce": { $type: "number" },
      $or: [
        { action: { $exists: false } },
        {
          action: "submit-proofs",
          sourceTxHash: { $exists: false },
        },
        {
          action: "submit-proofs",
          sourceTxHash: null,
        },
      ],
    });
    expect(sponsorWalletTransactions.createIndexes).not.toHaveBeenCalled();
  });

  it("blocks foundation funding when legacy rows share a sponsor nonce", async () => {
    process.env.FOUNDATION_FUNDED = "true";
    process.env.NEVM_V2_ACTIVATION_BLOCK = "100";
    sponsorWalletTransactions.aggregate.mockResolvedValue([
      { _id: { walletId: "0xSponsor", nonce: 3 }, count: 2 },
    ]);

    await expect(ensureSponsorIndexes()).rejects.toThrow(
      "Foundation funding V2 cutover blocked"
    );
    expect(sponsorWalletTransactions.createIndexes).not.toHaveBeenCalled();
  });

  it("blocks foundation funding when the V2 activation block is absent", async () => {
    process.env.FOUNDATION_FUNDED = "true";

    await expect(ensureSponsorIndexes()).rejects.toThrow(
      "NEVM V2 activation block is not configured"
    );
    expect(sponsorWalletTransactions.countDocuments).not.toHaveBeenCalled();
    expect(sponsorWalletTransactions.createIndexes).not.toHaveBeenCalled();
  });

  it("blocks startup until duplicate transfer ids are reconciled", async () => {
    transferModel.aggregate.mockResolvedValue([
      { _id: "duplicate-transfer", count: 2 },
    ]);

    await expect(ensureSponsorIndexes()).rejects.toThrow(
      "reconcile duplicate transfer ids"
    );
    expect(transferModel.createIndexes).not.toHaveBeenCalled();
    expect(sponsorWalletTransactions.createIndexes).not.toHaveBeenCalled();
  });
});
