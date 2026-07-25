import { describe, expect, it } from "@jest/globals";
import SponsorWalletTransactions from "../sponsor-wallet-transactions";

describe("SponsorWalletTransactions indexes", () => {
  it("serializes V2 submit-proofs nonce commits per sponsor wallet", () => {
    const nonceIndex = SponsorWalletTransactions.schema
      .indexes()
      .find(
        ([, options]) =>
          options.name ===
          "walletId_1_transaction_nonce_1_submit_proofs_v2"
      );

    expect(nonceIndex).toEqual([
      { walletId: 1, "transaction.nonce": 1 },
      expect.objectContaining({
        unique: true,
        partialFilterExpression: {
          action: "submit-proofs",
          sponsorProtocolVersion: 2,
          walletId: { $type: "string" },
          "transaction.nonce": { $type: "number" },
        },
      }),
    ]);
  });
});
