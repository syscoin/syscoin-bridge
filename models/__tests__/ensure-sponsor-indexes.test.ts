import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const collection: any = {
  indexes: jest.fn(),
  dropIndex: jest.fn(),
};
const sponsorWalletTransactions: any = {
  collection,
  createIndexes: jest.fn(),
};
const sponsorUtxoReservation: any = {
  createIndexes: jest.fn(),
};
const sponsorRateLimit: any = {
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
jest.mock("../sponsor-rate-limit", () => ({
  __esModule: true,
  default: sponsorRateLimit,
}));

import { ensureSponsorIndexes } from "../ensure-sponsor-indexes";

describe("ensureSponsorIndexes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sponsorWalletTransactions.createIndexes.mockResolvedValue(undefined);
    sponsorUtxoReservation.createIndexes.mockResolvedValue(undefined);
    sponsorRateLimit.createIndexes.mockResolvedValue(undefined);
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
    expect(sponsorRateLimit.createIndexes).toHaveBeenCalledTimes(1);
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
});
