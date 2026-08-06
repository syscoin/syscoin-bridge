import { COMMON_STATUS, ITransfer } from "@contexts/Transfer/types";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockWeb3 = {
  eth: {
    accounts: {
      privateKeyToAccount: jest.fn<any>(),
    },
    getBalance: jest.fn<any>(),
    getGasPrice: jest.fn<any>(),
    estimateGas: jest.fn<any>(),
    getTransactionCount: jest.fn<any>(),
    getTransaction: jest.fn<any>(),
    getTransactionReceipt: jest.fn<any>(),
    sendSignedTransaction: jest.fn<any>(),
  },
  utils: {
    fromWei: jest.fn(),
    toHex: jest.fn((value) => value),
  },
};

jest.mock("utils/get-web3", () => ({
  __esModule: true,
  default: mockWeb3,
}));

jest.mock("models/sponsor-wallet-transactions", () => {
  const Model: any = jest.fn(function (this: any, data: any) {
    Object.assign(this, data);
    this._id = this._id ?? "placeholder-id";
    this.save = jest.fn<any>().mockResolvedValue(this);
  });
  Model.findOne = jest.fn();
  Model.findOneAndUpdate = jest.fn();
  Model.updateOne = jest.fn();
  Model.countDocuments = jest.fn();
  Model.find = jest.fn();
  Model.aggregate = jest.fn();
  return {
    __esModule: true,
    default: Model,
    SponsorWalletTransactionCollectionName: "sponsorwallettransactions",
  };
});

jest.mock("models/sponsor-utxo-reservation", () => {
  const Model: any = jest.fn();
  Model.create = jest.fn();
  Model.updateOne = jest.fn();
  Model.deleteOne = jest.fn();
  return {
    __esModule: true,
    default: Model,
  };
});

jest.mock("satoshi-bitcoin", () => ({
  __esModule: true,
  default: {
    toSatoshi: jest.fn(() => 100_000),
  },
}));

jest.mock("syscoinjs-lib", () => ({
  syscoin: jest.fn(),
  utils: {
    BN: jest.fn(function (this: any, value: number) {
      this.value = value;
    }),
    syscoinNetworks: {
      mainnet: {},
      testnet: {},
    },
    fetchBackendRawTx: jest.fn(),
  },
}));

import SponsorWalletTransactions from "models/sponsor-wallet-transactions";
import SponsorUtxoReservation from "models/sponsor-utxo-reservation";
import { syscoin, utils as syscoinUtils } from "syscoinjs-lib";
import SponsorWalletService, {
  syscoinTxIdFromWitnessStrippedHex,
} from "../sponsor-wallet";

const SponsorWalletTransactionsMock = SponsorWalletTransactions as any;
const SponsorUtxoReservationMock = SponsorUtxoReservation as any;
const SyscoinMock = syscoin as jest.Mock;
const fetchBackendRawTxMock = syscoinUtils.fetchBackendRawTx as jest.Mock<any>;

const successfulBroadcast = (hash: string) => {
  const promiEvent = {
    once: jest.fn((event: string, listener: (value: string) => void) => {
      if (event === "transactionHash") {
        Promise.resolve().then(() => listener(hash));
      }
      return promiEvent;
    }),
    on: jest.fn(() => promiEvent),
    catch: jest.fn(() => promiEvent),
  };
  return promiEvent;
};

const failedBroadcast = (error: Error) => {
  const promiEvent = {
    once: jest.fn(() => promiEvent),
    on: jest.fn((event: string, listener: (value: Error) => void) => {
      if (event === "error") {
        Promise.resolve().then(() => listener(error));
      }
      return promiEvent;
    }),
    catch: jest.fn(() => promiEvent),
  };
  return promiEvent;
};

const transfer: ITransfer = {
  id: "transfer-1",
  type: "nevm-to-sys",
  status: COMMON_STATUS.INITIALIZE,
  amount: "1",
  logs: [],
  createdAt: Date.now(),
  utxoAddress: "sys1destination",
  utxoXpub: "xpub",
  nevmAddress: "0x0000000000000000000000000000000000000001",
  version: "v2",
  agreedToTerms: true,
};

describe("SponsorWalletService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWeb3.eth.accounts.privateKeyToAccount.mockReset();
    mockWeb3.eth.getGasPrice.mockReset();
    mockWeb3.eth.estimateGas.mockReset();
    mockWeb3.eth.getTransactionCount.mockReset();
    mockWeb3.eth.getTransaction.mockReset();
    mockWeb3.eth.getTransactionReceipt.mockReset();
    mockWeb3.eth.sendSignedTransaction.mockReset();
    SponsorWalletTransactionsMock.findOne.mockReset();
    SponsorWalletTransactionsMock.findOneAndUpdate.mockReset();
    SponsorWalletTransactionsMock.updateOne.mockReset();
    SponsorWalletTransactionsMock.countDocuments.mockReset();
    SponsorWalletTransactionsMock.find.mockReset();
    SponsorWalletTransactionsMock.countDocuments.mockResolvedValue(0);
    SponsorWalletTransactionsMock.updateOne.mockResolvedValue({
      modifiedCount: 1,
    });
    delete process.env.NEVM_SPONSOR_PRIVATE_KEY;
    delete process.env.UTXO_SPONSOR_ADDRESS;
    delete process.env.UTXO_SPONSOR_WIF;
    delete process.env.FOUNDATION_FUNDED;
    process.env.NEVM_V2_ACTIVATION_BLOCK = "1";
    global.fetch = jest.fn() as any;
  });

  describe("syscoinTxIdFromWitnessStrippedHex", () => {
    it("hashes witness-stripped bytes to a display-order txid", () => {
      const a = syscoinTxIdFromWitnessStrippedHex("00");
      const b = syscoinTxIdFromWitnessStrippedHex("0x00");
      expect(a).toMatch(/^[0-9a-f]{64}$/);
      expect(a).toBe(b);
      expect(() => syscoinTxIdFromWitnessStrippedHex("")).toThrow(
        "Invalid witness-stripped transaction hex"
      );
    });
  });

  describe("sponsorTransaction", () => {
    it("requires sourceTxHash for submit-proofs", async () => {
      process.env.NEVM_SPONSOR_PRIVATE_KEY = "nevm-private-key";
      const service = new SponsorWalletService();
      await expect(
        service.sponsorTransaction("transfer-1", {
          to: "0xRelay",
          data: "0xdata",
          value: 0,
        })
      ).rejects.toThrow("sourceTxHash is required");
    });

    it("signs NEVM sponsor transactions from the configured env private key", async () => {
      process.env.NEVM_SPONSOR_PRIVATE_KEY = "nevm-private-key";
      const signTransaction = jest.fn(() =>
        Promise.resolve({
          rawTransaction: "0xsigned",
          transactionHash: "0xhash",
        })
      );
      mockWeb3.eth.accounts.privateKeyToAccount.mockReturnValue({
        address: "0xSponsor",
        signTransaction,
      });
      mockWeb3.eth.getTransactionCount.mockResolvedValue(3);
      mockWeb3.eth.getGasPrice.mockResolvedValue("100");
      mockWeb3.eth.estimateGas.mockResolvedValue(120_000);
      mockWeb3.eth.sendSignedTransaction.mockImplementation(() =>
        successfulBroadcast("0xhash")
      );
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(null);
      SponsorWalletTransactionsMock.find.mockReturnValue({
        sort: () => Promise.resolve([]),
      });
      SponsorWalletTransactionsMock.findOneAndUpdate.mockResolvedValue({
        walletId: "0xSponsor",
        sourceTxHash:
          "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899",
        status: "pending",
        transaction: {
          hash: "0xhash",
          rawData: "0xsigned",
          nonce: 3,
          confirmedHash: "",
        },
      });
      const service = new SponsorWalletService();

      await expect(
        service.sponsorTransaction(
          "transfer-1",
          {
            to: "0xRelay",
            data: "0xdata",
            value: 0,
          },
          "submit-proofs",
          "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899"
        )
      ).resolves.toMatchObject({
        walletId: "0xSponsor",
        sourceTxHash:
          "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899",
        transaction: {
          hash: "0xhash",
          rawData: "0xsigned",
          nonce: 3,
        },
      });
      expect(mockWeb3.eth.accounts.privateKeyToAccount).toHaveBeenCalledWith(
        "nevm-private-key"
      );
      expect(signTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "0xSponsor",
          to: "0xRelay",
          data: "0xdata",
          nonce: 3,
        })
      );
      expect(mockWeb3.eth.sendSignedTransaction).toHaveBeenCalledWith(
        "0xsigned"
      );
      expect(
        SponsorWalletTransactionsMock.findOneAndUpdate.mock
          .invocationCallOrder[0]
      ).toBeLessThan(
        mockWeb3.eth.sendSignedTransaction.mock.invocationCallOrder[0]
      );
    });

    it("broadcasts a durable lower nonce before signing the next sponsorship", async () => {
      process.env.NEVM_SPONSOR_PRIVATE_KEY = "nevm-private-key";
      const signTransaction = jest.fn(() =>
        Promise.resolve({
          rawTransaction: "0xnext-raw",
          transactionHash: "0xnext-hash",
        })
      );
      const storedTransaction = {
        _id: "stored-id",
        action: "submit-proofs",
        walletId: "0xSponsor",
        sourceTxHash: "stored-source",
        status: "failed",
        transaction: {
          hash: "0xstored-hash",
          rawData: "0xstored-raw",
          nonce: 3,
          confirmedHash: "",
        },
      };
      mockWeb3.eth.accounts.privateKeyToAccount.mockReturnValue({
        address: "0xSponsor",
        signTransaction,
      });
      mockWeb3.eth.getTransactionCount
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(4);
      mockWeb3.eth.getGasPrice.mockResolvedValue("100");
      mockWeb3.eth.estimateGas.mockResolvedValue(120_000);
      mockWeb3.eth.sendSignedTransaction.mockImplementation((raw: string) =>
        successfulBroadcast(
          raw === "0xstored-raw" ? "0xstored-hash" : "0xnext-hash"
        )
      );
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(null);
      SponsorWalletTransactionsMock.find.mockReturnValue({
        sort: () => Promise.resolve([storedTransaction]),
      });
      SponsorWalletTransactionsMock.findOneAndUpdate.mockResolvedValue({
        _id: "next-id",
        action: "submit-proofs",
        walletId: "0xSponsor",
        sourceTxHash: "next-source",
        status: "pending",
        transaction: {
          hash: "0xnext-hash",
          rawData: "0xnext-raw",
          nonce: 4,
          confirmedHash: "",
        },
      });
      const service = new SponsorWalletService();

      await service.sponsorTransaction(
        "transfer-2",
        { to: "0xRelay", data: "0xdata", value: 0 },
        "submit-proofs",
        "next-source"
      );

      expect(mockWeb3.eth.sendSignedTransaction).toHaveBeenNthCalledWith(
        1,
        "0xstored-raw"
      );
      expect(signTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ nonce: 4 })
      );
      expect(
        mockWeb3.eth.sendSignedTransaction.mock.invocationCallOrder[0]
      ).toBeLessThan(signTransaction.mock.invocationCallOrder[0]);
    });

    it("fails closed when the chain advanced past an unknown durable transaction", async () => {
      process.env.NEVM_SPONSOR_PRIVATE_KEY = "nevm-private-key";
      const signTransaction = jest.fn();
      mockWeb3.eth.accounts.privateKeyToAccount.mockReturnValue({
        address: "0xSponsor",
        signTransaction,
      });
      mockWeb3.eth.getTransactionCount.mockResolvedValue(8);
      mockWeb3.eth.getTransaction.mockResolvedValue(undefined);
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(null);
      SponsorWalletTransactionsMock.find.mockReturnValue({
        sort: () =>
          Promise.resolve([
            {
              _id: "replaced-id",
              action: "submit-proofs",
              walletId: "0xSponsor",
              sourceTxHash: "replaced-source",
              status: "pending",
              transaction: {
                hash: "0xreplaced-hash",
                rawData: "0xreplaced-raw",
                nonce: 7,
                confirmedHash: "",
              },
            },
          ]),
      });
      const service = new SponsorWalletService();

      await expect(
        service.sponsorTransaction(
          "transfer-after-replacement",
          { to: "0xRelay", data: "0xdata", value: 0 },
          "submit-proofs",
          "new-source"
        )
      ).rejects.toThrow(
        "Sponsor transaction 0xreplaced-hash was replaced at nonce 7"
      );

      expect(mockWeb3.eth.getTransaction).toHaveBeenCalledWith(
        "0xreplaced-hash"
      );
      expect(signTransaction).not.toHaveBeenCalled();
      expect(mockWeb3.eth.sendSignedTransaction).not.toHaveBeenCalled();
    });

    it("allows a known durable lower nonce before signing the chain nonce", async () => {
      process.env.NEVM_SPONSOR_PRIVATE_KEY = "nevm-private-key";
      const signTransaction = jest.fn(() =>
        Promise.resolve({
          rawTransaction: "0xnext-raw",
          transactionHash: "0xnext-hash",
        })
      );
      mockWeb3.eth.accounts.privateKeyToAccount.mockReturnValue({
        address: "0xSponsor",
        signTransaction,
      });
      mockWeb3.eth.getTransactionCount.mockResolvedValue(8);
      mockWeb3.eth.getTransaction.mockResolvedValue({
        hash: "0xknown-hash",
        nonce: 7,
      });
      mockWeb3.eth.getGasPrice.mockResolvedValue("100");
      mockWeb3.eth.estimateGas.mockResolvedValue(120_000);
      mockWeb3.eth.sendSignedTransaction.mockImplementation(() =>
        successfulBroadcast("0xnext-hash")
      );
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(null);
      SponsorWalletTransactionsMock.find.mockReturnValue({
        sort: () =>
          Promise.resolve([
            {
              _id: "known-id",
              action: "submit-proofs",
              walletId: "0xSponsor",
              sourceTxHash: "known-source",
              status: "pending",
              transaction: {
                hash: "0xknown-hash",
                rawData: "0xknown-raw",
                nonce: 7,
                confirmedHash: "",
              },
            },
          ]),
      });
      SponsorWalletTransactionsMock.findOneAndUpdate.mockResolvedValue({
        _id: "next-id",
        action: "submit-proofs",
        walletId: "0xSponsor",
        sourceTxHash: "new-source",
        status: "pending",
        transaction: {
          hash: "0xnext-hash",
          rawData: "0xnext-raw",
          nonce: 8,
          confirmedHash: "",
        },
      });
      const service = new SponsorWalletService();

      await service.sponsorTransaction(
        "transfer-known-lower",
        { to: "0xRelay", data: "0xdata", value: 0 },
        "submit-proofs",
        "new-source"
      );

      expect(signTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ nonce: 8 })
      );
      expect(mockWeb3.eth.sendSignedTransaction).toHaveBeenCalledTimes(1);
      expect(mockWeb3.eth.sendSignedTransaction).toHaveBeenCalledWith(
        "0xnext-raw"
      );
    });

    it("fails closed instead of signing across a durable nonce gap", async () => {
      process.env.NEVM_SPONSOR_PRIVATE_KEY = "nevm-private-key";
      const signTransaction = jest.fn();
      mockWeb3.eth.accounts.privateKeyToAccount.mockReturnValue({
        address: "0xSponsor",
        signTransaction,
      });
      mockWeb3.eth.getTransactionCount.mockResolvedValue(3);
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(null);
      SponsorWalletTransactionsMock.find.mockReturnValue({
        sort: () =>
          Promise.resolve([
            {
              _id: "gap-id",
              action: "submit-proofs",
              walletId: "0xSponsor",
              sourceTxHash: "gap-source",
              status: "pending",
              transaction: {
                hash: "0xgap-hash",
                rawData: "0xgap-raw",
                nonce: 4,
                confirmedHash: "",
              },
            },
          ]),
      });
      const service = new SponsorWalletService();

      await expect(
        service.sponsorTransaction(
          "transfer-gap",
          { to: "0xRelay", data: "0xdata", value: 0 },
          "submit-proofs",
          "new-source"
        )
      ).rejects.toThrow(
        "Sponsor nonce recovery blocked: missing durable transaction for nonce 3"
      );
      expect(signTransaction).not.toHaveBeenCalled();
      expect(mockWeb3.eth.sendSignedTransaction).not.toHaveBeenCalled();
    });

    it("does not broadcast after a stale reservation owner loses its fence", async () => {
      process.env.NEVM_SPONSOR_PRIVATE_KEY = "nevm-private-key";
      const signTransaction = jest.fn(() =>
        Promise.resolve({
          rawTransaction: "0xfenced-raw",
          transactionHash: "0xfenced-hash",
        })
      );
      const stalePlaceholder: any = {
        _id: "stale-fence-id",
        transferId: "transfer-fence",
        action: "submit-proofs",
        sourceTxHash: "fence-source",
        walletId: "0xSponsor",
        status: "pending",
        updatedAt: new Date(Date.now() - 10 * 60_000),
        transaction: {},
      };
      mockWeb3.eth.accounts.privateKeyToAccount.mockReturnValue({
        address: "0xSponsor",
        signTransaction,
      });
      mockWeb3.eth.getTransactionCount.mockResolvedValue(3);
      mockWeb3.eth.getGasPrice.mockResolvedValue("100");
      mockWeb3.eth.estimateGas.mockResolvedValue(120_000);
      mockWeb3.eth.sendSignedTransaction.mockImplementation(() =>
        successfulBroadcast("0xfenced-hash")
      );
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(stalePlaceholder);
      SponsorWalletTransactionsMock.find.mockReturnValue({
        sort: () => Promise.resolve([]),
      });
      SponsorWalletTransactionsMock.findOneAndUpdate
        .mockImplementationOnce((_query: any, update: any) => {
          stalePlaceholder.reservationOwner = update.$set.reservationOwner;
          stalePlaceholder.reservationExpiresAt =
            update.$set.reservationExpiresAt;
          return Promise.resolve(stalePlaceholder);
        })
        .mockResolvedValueOnce(null);
      const service = new SponsorWalletService();

      await expect(
        service.sponsorTransaction(
          "transfer-fence",
          { to: "0xRelay", data: "0xdata", value: 0 },
          "submit-proofs",
          "fence-source"
        )
      ).rejects.toThrow("Sponsorship is already in progress");

      expect(
        SponsorWalletTransactionsMock.findOneAndUpdate
      ).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          _id: "stale-fence-id",
          reservationOwner: stalePlaceholder.reservationOwner,
          reservationExpiresAt: { $gt: expect.any(Date) },
        }),
        expect.any(Object),
        { new: true }
      );
      expect(signTransaction).toHaveBeenCalledTimes(1);
      expect(mockWeb3.eth.sendSignedTransaction).not.toHaveBeenCalled();
    });

    it("replays lower nonces before returning an existing sponsorship", async () => {
      process.env.NEVM_SPONSOR_PRIVATE_KEY = "nevm-private-key";
      const signTransaction = jest.fn();
      mockWeb3.eth.accounts.privateKeyToAccount.mockReturnValue({
        address: "0xSponsor",
        signTransaction,
      });
      const lowerTransaction = {
        _id: "lower-id",
        transferId: "transfer-lower",
        action: "submit-proofs",
        sourceTxHash: "lower-source",
        walletId: "0xSponsor",
        status: "pending",
        transaction: { hash: "0xlower", rawData: "0xlower-raw", nonce: 1 },
      };
      const existingTransaction = {
        _id: "existing-id",
        transferId: "transfer-alias-a",
        action: "submit-proofs",
        sourceTxHash: "deadbeef",
        walletId: "0xSponsor",
        status: "pending",
        transaction: { hash: "0xalready", rawData: "0xraw", nonce: 2 },
      };
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(
        existingTransaction
      );
      SponsorWalletTransactionsMock.find.mockReturnValue({
        sort: () => Promise.resolve([lowerTransaction, existingTransaction]),
      });
      mockWeb3.eth.getTransactionCount
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(3);
      mockWeb3.eth.sendSignedTransaction.mockImplementation((raw: string) =>
        successfulBroadcast(raw === "0xlower-raw" ? "0xlower" : "0xalready")
      );
      const service = new SponsorWalletService();

      await expect(
        service.sponsorTransaction(
          "transfer-alias-b",
          { to: "0xRelay", data: "0xdata", value: 0 },
          "submit-proofs",
          "DEADBEEF"
        )
      ).resolves.toMatchObject({
        transferId: "transfer-alias-a",
        status: "pending",
        transaction: { hash: "0xalready" },
      });
      expect(signTransaction).not.toHaveBeenCalled();
      expect(mockWeb3.eth.estimateGas).not.toHaveBeenCalled();
      expect(mockWeb3.eth.sendSignedTransaction).toHaveBeenNthCalledWith(
        1,
        "0xlower-raw"
      );
      expect(mockWeb3.eth.sendSignedTransaction).toHaveBeenNthCalledWith(
        2,
        "0xraw"
      );
      expect(SponsorWalletTransactionsMock.updateOne).toHaveBeenLastCalledWith(
        { _id: "existing-id", "transaction.hash": "0xalready" },
        { $set: { broadcastAt: expect.any(Date) } }
      );
    });

    it("preserves a successful existing sponsorship without rebroadcasting it", async () => {
      const successfulTransaction = {
        _id: "successful-id",
        transferId: "transfer-successful",
        action: "submit-proofs",
        sourceTxHash: "successful-source",
        walletId: "0xSponsor",
        status: "success",
        transaction: {
          hash: "0xsuccessful",
          rawData: "0xsuccessful-raw",
          nonce: 1,
        },
      };
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(
        successfulTransaction
      );
      SponsorWalletTransactionsMock.find.mockReturnValue({
        sort: () => Promise.resolve([successfulTransaction]),
      });
      mockWeb3.eth.getTransactionCount.mockResolvedValue(2);
      mockWeb3.eth.getTransaction.mockResolvedValue({
        hash: "0xsuccessful",
        nonce: 1,
      });
      const service = new SponsorWalletService();

      await expect(
        service.sponsorTransaction(
          "transfer-successful",
          { to: "0xRelay", data: "0xdata", value: 0 },
          "submit-proofs",
          "successful-source"
        )
      ).resolves.toMatchObject({
        status: "success",
        transaction: { hash: "0xsuccessful" },
      });

      expect(mockWeb3.eth.sendSignedTransaction).not.toHaveBeenCalled();
      expect(mockWeb3.eth.getTransaction).toHaveBeenCalledWith("0xsuccessful");
      expect(SponsorWalletTransactionsMock.updateOne).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({ status: "pending" }),
        })
      );
    });

    it("replays a successful row when the RPC pending nonce rolls back to it", async () => {
      const successfulTransaction = {
        _id: "reorged-success-id",
        transferId: "transfer-reorged-success",
        action: "submit-proofs",
        sourceTxHash: "reorged-success-source",
        walletId: "0xSponsor",
        status: "success",
        transaction: {
          hash: "0xreorged-success",
          rawData: "0xreorged-success-raw",
          nonce: 1,
        },
      };
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(
        successfulTransaction
      );
      SponsorWalletTransactionsMock.find.mockReturnValue({
        sort: () => Promise.resolve([successfulTransaction]),
      });
      mockWeb3.eth.getTransactionCount
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2);
      mockWeb3.eth.sendSignedTransaction.mockImplementation(() =>
        successfulBroadcast("0xreorged-success")
      );
      const service = new SponsorWalletService();

      await expect(
        service.sponsorTransaction(
          "transfer-reorged-success",
          { to: "0xRelay", data: "0xdata", value: 0 },
          "submit-proofs",
          "reorged-success-source"
        )
      ).resolves.toMatchObject({
        status: "success",
        transaction: { hash: "0xreorged-success" },
      });

      expect(SponsorWalletTransactionsMock.find).toHaveBeenCalledWith({
        action: "submit-proofs",
        walletId: "0xSponsor",
        sourceTxHash: { $type: "string" },
        "transaction.rawData": { $type: "string" },
        "transaction.nonce": { $type: "number" },
      });
      expect(mockWeb3.eth.sendSignedTransaction).toHaveBeenCalledWith(
        "0xreorged-success-raw"
      );
    });

    it("recovers and broadcasts a committed duplicate that wins the placeholder race", async () => {
      process.env.NEVM_SPONSOR_PRIVATE_KEY = "nevm-private-key";
      const signTransaction = jest.fn();
      mockWeb3.eth.accounts.privateKeyToAccount.mockReturnValue({
        address: "0xSponsor",
        signTransaction,
      });
      const committedDuplicate = {
        _id: "duplicate-committed-id",
        transferId: "transfer-duplicate",
        action: "submit-proofs",
        sourceTxHash: "duplicate-source",
        walletId: "0xSponsor",
        status: "pending",
        transaction: {
          hash: "0xduplicate-hash",
          rawData: "0xduplicate-raw",
          nonce: 3,
        },
      };
      SponsorWalletTransactionsMock.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(committedDuplicate);
      SponsorWalletTransactionsMock.mockImplementationOnce(function (
        this: any,
        data: any
      ) {
        Object.assign(this, data);
        this.save = jest.fn<any>().mockRejectedValue({ code: 11000 });
      });
      SponsorWalletTransactionsMock.find.mockReturnValue({
        sort: () => Promise.resolve([committedDuplicate]),
      });
      mockWeb3.eth.getTransactionCount
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(4);
      mockWeb3.eth.sendSignedTransaction.mockImplementation(() =>
        successfulBroadcast("0xduplicate-hash")
      );
      const service = new SponsorWalletService();

      await expect(
        service.sponsorTransaction(
          "transfer-duplicate",
          { to: "0xRelay", data: "0xdata", value: 0 },
          "submit-proofs",
          "duplicate-source"
        )
      ).resolves.toMatchObject({
        transaction: { hash: "0xduplicate-hash" },
      });

      expect(signTransaction).not.toHaveBeenCalled();
      expect(mockWeb3.eth.estimateGas).not.toHaveBeenCalled();
      expect(mockWeb3.eth.sendSignedTransaction).toHaveBeenCalledWith(
        "0xduplicate-raw"
      );
    });

    it("keeps a durable signed row pending when broadcast fails", async () => {
      process.env.NEVM_SPONSOR_PRIVATE_KEY = "nevm-private-key";
      const broadcastError = new Error("RPC unavailable");
      const signTransaction = jest.fn(() =>
        Promise.resolve({
          rawTransaction: "0xdurable-raw",
          transactionHash: "0xdurable-hash",
        })
      );
      const committedTransaction = {
        _id: "durable-id",
        action: "submit-proofs",
        walletId: "0xSponsor",
        sourceTxHash: "durable-source",
        status: "pending",
        transaction: {
          hash: "0xdurable-hash",
          rawData: "0xdurable-raw",
          nonce: 3,
          confirmedHash: "",
        },
      };
      mockWeb3.eth.accounts.privateKeyToAccount.mockReturnValue({
        address: "0xSponsor",
        signTransaction,
      });
      mockWeb3.eth.getTransactionCount.mockResolvedValue(3);
      mockWeb3.eth.getTransaction.mockResolvedValue(undefined);
      mockWeb3.eth.getGasPrice.mockResolvedValue("100");
      mockWeb3.eth.estimateGas.mockResolvedValue(120_000);
      mockWeb3.eth.sendSignedTransaction.mockImplementation(() =>
        failedBroadcast(broadcastError)
      );
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(null);
      SponsorWalletTransactionsMock.find.mockReturnValue({
        sort: () => Promise.resolve([]),
      });
      SponsorWalletTransactionsMock.findOneAndUpdate.mockResolvedValue(
        committedTransaction
      );
      const service = new SponsorWalletService();

      await expect(
        service.sponsorTransaction(
          "transfer-durable",
          { to: "0xRelay", data: "0xdata", value: 0 },
          "submit-proofs",
          "durable-source"
        )
      ).rejects.toThrow("RPC unavailable");

      expect(SponsorWalletTransactionsMock.findOneAndUpdate).toHaveBeenCalled();
      expect(mockWeb3.eth.sendSignedTransaction).toHaveBeenCalledWith(
        "0xdurable-raw"
      );
      expect(SponsorWalletTransactionsMock.updateOne).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({ status: "failed" }),
        })
      );
    });

    it("rejects an unsigned sponsorship that is still in progress", async () => {
      SponsorWalletTransactionsMock.findOne.mockResolvedValue({
        transferId: "transfer-alias-a",
        action: "submit-proofs",
        sourceTxHash: "deadbeef",
        status: "pending",
        updatedAt: new Date(),
        transaction: {},
      });
      SponsorWalletTransactionsMock.findOneAndUpdate.mockResolvedValue(null);
      const service = new SponsorWalletService();

      await expect(
        service.sponsorTransaction(
          "transfer-alias-b",
          { to: "0xRelay", data: "0xdata", value: 0 },
          "submit-proofs",
          "DEADBEEF"
        )
      ).rejects.toThrow("Sponsorship is already in progress");
      expect(mockWeb3.eth.accounts.privateKeyToAccount).not.toHaveBeenCalled();
      expect(mockWeb3.eth.estimateGas).not.toHaveBeenCalled();
    });

    it("reacquires and signs a stale unsigned sponsorship", async () => {
      process.env.NEVM_SPONSOR_PRIVATE_KEY = "nevm-private-key";
      const signTransaction = jest.fn(() =>
        Promise.resolve({
          rawTransaction: "0xsigned",
          transactionHash: "0xhash",
        })
      );
      const stalePlaceholder: any = {
        _id: "stale-id",
        transferId: "transfer-1",
        action: "submit-proofs",
        sourceTxHash: "deadbeef",
        walletId: "0xSponsor",
        status: "pending",
        updatedAt: new Date(Date.now() - 10 * 60_000),
        transaction: {},
        save: jest.fn<any>().mockResolvedValue(undefined),
      };
      mockWeb3.eth.accounts.privateKeyToAccount.mockReturnValue({
        address: "0xSponsor",
        signTransaction,
      });
      mockWeb3.eth.getTransactionCount.mockResolvedValue(3);
      mockWeb3.eth.getGasPrice.mockResolvedValue("100");
      mockWeb3.eth.estimateGas.mockResolvedValue(120_000);
      mockWeb3.eth.sendSignedTransaction.mockImplementation(() =>
        successfulBroadcast("0xhash")
      );
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(stalePlaceholder);
      SponsorWalletTransactionsMock.findOneAndUpdate.mockImplementation(
        (_query: any, update: any) => {
          if (update.$set?.reservationOwner) {
            stalePlaceholder.reservationOwner = update.$set.reservationOwner;
            stalePlaceholder.reservationExpiresAt =
              update.$set.reservationExpiresAt;
            return Promise.resolve(stalePlaceholder);
          }
          return Promise.resolve({
            ...stalePlaceholder,
            transaction: update.$set.transaction,
          });
        }
      );
      SponsorWalletTransactionsMock.find.mockReturnValue({
        sort: () => Promise.resolve([]),
      });
      const service = new SponsorWalletService();

      await expect(
        service.sponsorTransaction(
          "transfer-1",
          { to: "0xRelay", data: "0xdata", value: 0 },
          "submit-proofs",
          "DEADBEEF"
        )
      ).resolves.toMatchObject({
        transaction: {
          hash: "0xhash",
          rawData: "0xsigned",
          nonce: 3,
        },
      });
      expect(SponsorWalletTransactionsMock.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "submit-proofs",
          status: "pending",
          "transaction.hash": { $exists: false },
          $and: expect.any(Array),
        }),
        expect.objectContaining({
          $set: expect.objectContaining({
            status: "pending",
            transaction: {},
            reservationOwner: expect.any(String),
            reservationExpiresAt: expect.any(Date),
            updatedAt: expect.any(Date),
          }),
        }),
        { new: true }
      );
      expect(signTransaction).toHaveBeenCalledTimes(1);
    });

    it("refuses to sponsor when gas estimation fails", async () => {
      process.env.NEVM_SPONSOR_PRIVATE_KEY = "nevm-private-key";
      mockWeb3.eth.accounts.privateKeyToAccount.mockReturnValue({
        address: "0xSponsor",
        signTransaction: jest.fn(),
      });
      mockWeb3.eth.getTransactionCount.mockResolvedValue(3);
      mockWeb3.eth.getGasPrice.mockResolvedValue("100");
      mockWeb3.eth.estimateGas.mockRejectedValue(new Error("execution reverted"));
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(null);
      SponsorWalletTransactionsMock.find.mockReturnValue({
        sort: () => Promise.resolve([]),
      });
      const service = new SponsorWalletService();

      await expect(
        service.sponsorTransaction(
          "transfer-1",
          {
            to: "0xRelay",
            data: "0xdata",
            value: 0,
          },
          "submit-proofs",
          "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899"
        )
      ).rejects.toThrow("execution reverted");
    });
  });

  describe("sponsorUtxoClaimGas", () => {
    it("rejects claim gas for a pre-activation source block", async () => {
      process.env.NEVM_V2_ACTIVATION_BLOCK = "100";
      const service = new SponsorWalletService();

      await expect(
        service.sponsorUtxoClaimGas(transfer, undefined, 99)
      ).rejects.toThrow("before the V2 activation block");
      expect(SponsorWalletTransactionsMock.findOne).not.toHaveBeenCalled();
    });

    it("returns the existing claim gas transaction when one was already created", async () => {
      SponsorWalletTransactionsMock.findOne.mockResolvedValue({
        status: "pending",
        transaction: { hash: "utxo-txid" },
      });

      const service = new SponsorWalletService();

      await expect(
        service.sponsorUtxoClaimGas(transfer, undefined, 1)
      ).resolves.toEqual({
        funded: true,
        status: "pending",
        txid: "utxo-txid",
      });
    });

    it("looks up existing claim gas transactions by source burn transaction", async () => {
      SponsorWalletTransactionsMock.findOne.mockResolvedValue({
        status: "pending",
        transaction: { hash: "utxo-txid" },
      });

      const service = new SponsorWalletService();

      await expect(
        service.getUtxoClaimGasSponsorStatus("transfer-2", "0xburn")
      ).resolves.toMatchObject({
        funded: true,
        txid: "utxo-txid",
      });
      expect(SponsorWalletTransactionsMock.findOne).toHaveBeenCalledWith({
        action: "utxo-claim-gas",
        $or: [{ transferId: "transfer-2" }, { sourceTxHash: "0xburn" }],
      });
    });

    it("skips funding when the destination already has enough claim gas", async () => {
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(null);
      (global.fetch as jest.Mock<any>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ value: "100000" }]),
      });

      const service = new SponsorWalletService();

      await expect(
        service.sponsorUtxoClaimGas(transfer, undefined, 1)
      ).resolves.toEqual({
        funded: false,
        status: "skipped",
        amountSats: 0,
        balanceSats: 100_000,
        reason: "Destination UTXO address already has claim gas",
      });
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v2/utxo/sys1destination")
      );
      expect(global.fetch).not.toHaveBeenCalledWith(
        expect.stringContaining("/api/v2/utxo/xpub")
      );
    });

    it("skips funding when the wallet xpub has enough claim gas", async () => {
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(null);
      (global.fetch as jest.Mock<any>)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([{ value: "100000" }]),
        });

      const service = new SponsorWalletService();

      await expect(
        service.sponsorUtxoClaimGas(transfer, undefined, 1)
      ).resolves.toEqual({
        funded: false,
        status: "skipped",
        amountSats: 0,
        balanceSats: 100_000,
        reason: "Connected UTXO wallet already has claim gas",
      });
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v2/utxo/sys1destination")
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v2/utxo/xpub")
      );
    });

    it("does not count SYS locked in asset-bearing UTXOs as claim gas", async () => {
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(null);
      (global.fetch as jest.Mock<any>)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                value: "2989998650",
                assetInfo: {
                  assetGuid: "123456",
                  value: "10000000",
                },
              },
            ]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                value: "2989998650",
                assetInfo: {
                  assetGuid: "123456",
                  value: "10000000",
                },
              },
            ]),
        });

      const service = new SponsorWalletService();

      await expect(
        service.getUtxoClaimGasFundingStatus(transfer)
      ).resolves.toBeUndefined();
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("sums only pure SYS outputs when checking claim gas", async () => {
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(null);
      (global.fetch as jest.Mock<any>).mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              value: "2989998650",
              assetInfo: {
                assetGuid: "123456",
                value: "10000000",
              },
            },
            { value: "40000" },
            { value: "60000" },
          ]),
      });

      const service = new SponsorWalletService();

      await expect(
        service.getUtxoClaimGasFundingStatus(transfer)
      ).resolves.toMatchObject({
        funded: false,
        status: "skipped",
        balanceSats: 100_000,
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("reserves a specific sponsor UTXO for claim gas funding", async () => {
      process.env.UTXO_SPONSOR_ADDRESS = "sys1sponsor";
      process.env.UTXO_SPONSOR_WIF = "sponsor-wif";
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(null);
      SponsorUtxoReservationMock.create.mockResolvedValue({});
      SponsorUtxoReservationMock.updateOne.mockResolvedValue({
        modifiedCount: 1,
      });
      SponsorUtxoReservationMock.deleteOne.mockResolvedValue({
        deletedCount: 0,
      });
      SponsorWalletTransactionsMock.findOneAndUpdate
        .mockResolvedValueOnce({
          _id: "placeholder-id",
          reservationOwner: "utxo-owner",
          status: "pending",
          transaction: {},
        })
        .mockResolvedValueOnce({
          _id: "placeholder-id",
          status: "pending",
          transaction: {
            hash: "utxo-txid",
            rawData: "utxo-txid",
            nonce: 0,
            confirmedHash: "",
          },
        });
      (global.fetch as jest.Mock<any>)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              { txid: "dust-utxo", vout: 2, value: "500" },
              {
                txid: "asset-utxo",
                vout: 3,
                value: "500000",
                assetInfo: { assetGuid: "123456", value: "10000000" },
              },
              { txid: "large-utxo", vout: 0, value: "2000000" },
              { txid: "small-utxo", vout: 1, value: "1000000" },
            ]),
        });

      const extractTransaction = jest.fn(() => ({ getId: () => "utxo-txid" }));
      const createTransaction = jest.fn(() =>
        Promise.resolve({ psbt: "unsigned-psbt" })
      );
      const signAndSendWithWIF = jest.fn(() =>
        Promise.resolve({
          extractTransaction,
        })
      );
      SyscoinMock.mockImplementation(() => ({
        createTransaction,
        signAndSendWithWIF,
      }));

      const service = new SponsorWalletService();

      await expect(
        service.sponsorUtxoClaimGas(transfer, undefined, 1)
      ).resolves.toMatchObject(
        {
          funded: true,
          status: "pending",
          txid: "utxo-txid",
        }
      );
      expect(SponsorUtxoReservationMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          key: "small-utxo:1",
          transferId: "transfer-1",
          txid: "small-utxo",
          vout: 1,
          status: "reserved",
        })
      );
      expect(createTransaction).toHaveBeenCalledTimes(1);
      expect(createTransaction).toHaveBeenCalledWith(
        expect.anything(),
        "sys1sponsor",
        expect.any(Array),
        expect.anything(),
        "sys1sponsor",
        [{ txid: "small-utxo", vout: 1, value: "1000000" }]
      );
      expect(signAndSendWithWIF).toHaveBeenCalledWith(
        "unsigned-psbt",
        "sponsor-wif"
      );
      expect(createTransaction.mock.invocationCallOrder[0]).toBeLessThan(
        SponsorWalletTransactionsMock.findOneAndUpdate.mock
          .invocationCallOrder[0]
      );
      expect(
        SponsorWalletTransactionsMock.findOneAndUpdate.mock
          .invocationCallOrder[0]
      ).toBeLessThan(signAndSendWithWIF.mock.invocationCallOrder[0]);
      expect(SponsorUtxoReservationMock.updateOne).toHaveBeenNthCalledWith(
        1,
        { key: "small-utxo:1", status: "reserved" },
        {
          $set: { status: "broadcasting" },
          $unset: { expiresAt: "" },
        }
      );
      expect(
        SponsorWalletTransactionsMock.findOneAndUpdate
      ).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          _id: "placeholder-id",
          status: "pending",
          reservationOwner: expect.any(String),
          reservationExpiresAt: { $gt: expect.any(Date) },
          "transaction.hash": { $exists: false },
        }),
        expect.objectContaining({
          $set: {
            reservationExpiresAt: expect.any(Date),
            reservationPhase: "broadcasting",
          },
        }),
        { new: true }
      );
      expect(
        SponsorWalletTransactionsMock.findOneAndUpdate
      ).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          _id: "placeholder-id",
          status: "pending",
          reservationOwner: "utxo-owner",
          "transaction.hash": { $exists: false },
        }),
        expect.objectContaining({
          $set: expect.objectContaining({
            status: "pending",
            transaction: expect.objectContaining({ hash: "utxo-txid" }),
          }),
          $unset: {
            reservationOwner: "",
            reservationExpiresAt: "",
            reservationPhase: "",
          },
        }),
        { new: true }
      );
      expect(SponsorUtxoReservationMock.updateOne).toHaveBeenNthCalledWith(
        2,
        { key: "small-utxo:1", status: "broadcasting" },
        {
          $set: {
            status: "spent",
            expiresAt: expect.any(Date),
          },
        }
      );
      expect(SponsorUtxoReservationMock.deleteOne).not.toHaveBeenCalled();
    });

    it("releases the reservation when UTXO construction fails before broadcast", async () => {
      process.env.UTXO_SPONSOR_ADDRESS = "sys1sponsor";
      process.env.UTXO_SPONSOR_WIF = "sponsor-wif";
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(null);
      SponsorUtxoReservationMock.create.mockResolvedValue({});
      SponsorUtxoReservationMock.deleteOne.mockResolvedValue({
        deletedCount: 1,
      });
      (global.fetch as jest.Mock<any>)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              { txid: "construction-utxo", vout: 0, value: "1000000" },
            ]),
        });
      const constructionError = new Error("Unable to build PSBT");
      const createTransaction = jest.fn(() =>
        Promise.reject(constructionError)
      );
      const signAndSendWithWIF = jest.fn();
      SyscoinMock.mockImplementation(() => ({
        createTransaction,
        signAndSendWithWIF,
      }));

      const service = new SponsorWalletService();

      await expect(
        service.sponsorUtxoClaimGas(transfer, undefined, 1)
      ).rejects.toThrow(
        "Unable to build PSBT"
      );

      expect(signAndSendWithWIF).not.toHaveBeenCalled();
      expect(
        SponsorWalletTransactionsMock.findOneAndUpdate
      ).not.toHaveBeenCalled();
      expect(SponsorWalletTransactionsMock.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: "placeholder-id",
          reservationOwner: expect.any(String),
          "transaction.hash": { $exists: false },
        }),
        {
          $set: { status: "failed" },
          $unset: {
            reservationOwner: "",
            reservationExpiresAt: "",
            reservationPhase: "",
          },
        }
      );
      expect(SponsorUtxoReservationMock.deleteOne).toHaveBeenCalledWith({
        key: "construction-utxo:0",
        status: "reserved",
      });
    });

    it("retains the specific UTXO when broadcast outcome is unknown", async () => {
      process.env.UTXO_SPONSOR_ADDRESS = "sys1sponsor";
      process.env.UTXO_SPONSOR_WIF = "sponsor-wif";
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(null);
      SponsorWalletTransactionsMock.findOneAndUpdate.mockResolvedValueOnce({
        _id: "placeholder-id",
        reservationOwner: "utxo-owner",
        reservationPhase: "broadcasting",
        status: "pending",
        transaction: {},
      });
      SponsorUtxoReservationMock.create.mockResolvedValue({});
      SponsorUtxoReservationMock.updateOne.mockResolvedValue({
        modifiedCount: 1,
      });
      (global.fetch as jest.Mock<any>)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              { txid: "ambiguous-utxo", vout: 0, value: "1000000" },
            ]),
        });
      const createTransaction = jest.fn(() =>
        Promise.resolve({ psbt: "unsigned-psbt" })
      );
      const signAndSendWithWIF = jest.fn(() =>
        Promise.reject(new Error("Broadcast response lost"))
      );
      SyscoinMock.mockImplementation(() => ({
        createTransaction,
        signAndSendWithWIF,
      }));

      const service = new SponsorWalletService();

      await expect(
        service.sponsorUtxoClaimGas(transfer, undefined, 1)
      ).rejects.toThrow(
        "Broadcast response lost"
      );

      expect(SponsorUtxoReservationMock.updateOne).toHaveBeenCalledWith(
        { key: "ambiguous-utxo:0", status: "reserved" },
        {
          $set: { status: "broadcasting" },
          $unset: { expiresAt: "" },
        }
      );
      expect(SponsorUtxoReservationMock.deleteOne).not.toHaveBeenCalled();
      expect(SponsorWalletTransactionsMock.updateOne).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({ status: "failed" }),
        })
      );
    });

    it("returns in-progress when a duplicate placeholder wins the race", async () => {
      process.env.UTXO_SPONSOR_ADDRESS = "sys1sponsor";
      process.env.UTXO_SPONSOR_WIF = "sponsor-wif";
      SponsorWalletTransactionsMock.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          status: "pending",
          transaction: {},
        });
      SponsorWalletTransactionsMock.mockImplementationOnce(function (
        this: any,
        data: any
      ) {
        Object.assign(this, data);
        this.save = jest.fn<any>().mockRejectedValue({ code: 11000 });
      });
      (global.fetch as jest.Mock<any>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      const service = new SponsorWalletService();

      await expect(
        service.sponsorUtxoClaimGas(transfer, undefined, 1)
      ).resolves.toEqual({
        funded: true,
        status: "pending",
        reason: "UTXO claim gas sponsorship is already in progress",
      });
      expect(SponsorUtxoReservationMock.create).not.toHaveBeenCalled();
    });

    it("returns in-progress when a failed placeholder retry lock is already taken", async () => {
      process.env.UTXO_SPONSOR_ADDRESS = "sys1sponsor";
      process.env.UTXO_SPONSOR_WIF = "sponsor-wif";
      SponsorWalletTransactionsMock.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          status: "failed",
          transaction: {},
        });
      SponsorWalletTransactionsMock.findOneAndUpdate.mockResolvedValue(null);
      SponsorWalletTransactionsMock.mockImplementationOnce(function (
        this: any,
        data: any
      ) {
        Object.assign(this, data);
        this.save = jest.fn<any>().mockRejectedValue({ code: 11000 });
      });
      (global.fetch as jest.Mock<any>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      const service = new SponsorWalletService();

      await expect(
        service.sponsorUtxoClaimGas(transfer, "0xburn", 1)
      ).resolves.toEqual({
        funded: true,
        status: "pending",
        reason: "UTXO claim gas sponsorship is already in progress",
      });
      expect(SponsorWalletTransactionsMock.findOneAndUpdate).toHaveBeenCalledWith(
        {
          action: "utxo-claim-gas",
          status: "failed",
          "transaction.hash": { $exists: false },
          $or: [{ transferId: "transfer-1" }, { sourceTxHash: "0xburn" }],
        },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: "pending",
            transaction: {},
            reservationOwner: expect.any(String),
            reservationExpiresAt: expect.any(Date),
          }),
        }),
        { new: true }
      );
      expect(SponsorUtxoReservationMock.create).not.toHaveBeenCalled();
    });

    it("expires stale pending claim gas placeholders without a hash", async () => {
      const stalePlaceholder = {
        _id: "stale-utxo-placeholder",
        status: "pending",
        transaction: {},
        updatedAt: new Date(Date.now() - 10 * 60_000),
      };
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(stalePlaceholder);
      SponsorWalletTransactionsMock.findOneAndUpdate.mockResolvedValue({
        ...stalePlaceholder,
        status: "failed",
      });

      const service = new SponsorWalletService();

      await expect(
        service.getUtxoClaimGasSponsorStatus("transfer-1")
      ).resolves.toBeUndefined();
      expect(SponsorWalletTransactionsMock.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: "stale-utxo-placeholder",
          status: "pending",
          "transaction.hash": { $exists: false },
          $or: [
            { reservationExpiresAt: { $lte: expect.any(Date) } },
            {
              reservationExpiresAt: { $exists: false },
              updatedAt: { $lte: expect.any(Date) },
            },
          ],
        },
        {
          $set: { status: "failed" },
          $unset: {
            reservationOwner: "",
            reservationExpiresAt: "",
          },
        },
        { new: true }
      );
    });

    it("does not retry an expired UTXO reservation with an unknown broadcast outcome", async () => {
      const broadcastingPlaceholder = {
        _id: "broadcasting-utxo-placeholder",
        status: "pending",
        reservationPhase: "broadcasting",
        reservationExpiresAt: new Date(Date.now() - 10 * 60_000),
        transaction: {},
      };
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(
        broadcastingPlaceholder
      );

      const service = new SponsorWalletService();

      await expect(
        service.getUtxoClaimGasSponsorStatus("transfer-1")
      ).resolves.toEqual({
        funded: true,
        status: "pending",
        reason:
          "UTXO sponsorship broadcast outcome requires manual reconciliation",
      });
      expect(
        SponsorWalletTransactionsMock.findOneAndUpdate
      ).not.toHaveBeenCalled();
    });
  });

  describe("updateSponsorWalletTransactionStatus", () => {
    it("looks up NEVM sponsor transactions by nested transaction hash", async () => {
      const record = {
        status: "pending",
        transaction: { hash: "0xabc", confirmedHash: "" },
        save: jest.fn<any>().mockResolvedValue(undefined),
      };
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(record);
      mockWeb3.eth.getTransactionReceipt.mockResolvedValue({
        blockNumber: 1,
        status: true,
        transactionHash: "0xabc",
      });

      const service = new SponsorWalletService();
      await service.updateSponsorWalletTransactionStatus("0xabc");

      expect(SponsorWalletTransactionsMock.findOne).toHaveBeenCalledWith({
        "transaction.hash": "0xabc",
      });
      expect(record.status).toBe("success");
      expect(record.transaction.confirmedHash).toBe("0xabc");
      expect(record.save).toHaveBeenCalled();
    });
  });

  describe("updateUtxoSponsorWalletTransactionStatus", () => {
    it("marks observed UTXO claim gas transactions as successful", async () => {
      const record = {
        status: "pending",
        transaction: { hash: "utxo-txid", confirmedHash: "" },
        save: jest.fn<any>().mockResolvedValue(undefined),
      };
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(record);
      fetchBackendRawTxMock.mockResolvedValue({ txid: "utxo-txid" });

      const service = new SponsorWalletService();
      await service.updateUtxoSponsorWalletTransactionStatus("utxo-txid");

      expect(SponsorWalletTransactionsMock.findOne).toHaveBeenCalledWith({
        "transaction.hash": "utxo-txid",
        action: "utxo-claim-gas",
      });
      expect(record.status).toBe("success");
      expect(record.transaction.confirmedHash).toBe("utxo-txid");
      expect(record.save).toHaveBeenCalled();
    });
  });
});
