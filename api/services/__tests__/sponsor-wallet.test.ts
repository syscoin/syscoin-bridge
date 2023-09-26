import { describe, expect, it, jest } from "@jest/globals";
const SponsorWalletMock = jest.mock("models/sponsor-wallet");
// Mock util/get-web3

const web3Mock = {
  eth: {
    accounts: {
      privateKeyToAccount: jest.fn(),
    },
    getBalance: jest.fn(),
    sendSignedTransaction: jest.fn(),
  },
  utils: {
    fromWei: jest.fn(),
  },
};
jest.mock("utils/get-web3", () => {
  return jest.fn(() => web3Mock);
});
import SponsorWalletService from "../sponsor-wallet";

describe("SponsorWalletService", () => {
  describe("createSponsorWallet", () => {
    it("should throw an error if privateKey provided is invalid", async () => {
      const service = new SponsorWalletService();

      await expect(
        service.createSponsorWallet("invalidPrivateKey")
      ).rejects.toThrow("Private key must be 32 bytes long");
    });

    /**
     * To Do Test:
     * 1. It should throw error if address balance is less than 0.01
     * 2. It should create a new wallet if address balance is greater than 0.01
     */
  });

  describe("sponsorTransaction", () => {
    /**
     * To Do Test:
     * 1. It should throw error if no wallet available
     * 2. When there is a wallet available
     * 2.1 It should throw error if transaction config is invalid
     * 2.2 It should throw return tx hash from the receipt if transaction config is valid
     */
    // Jest Mock Mongoose Model SponsorWallet
  });
});
