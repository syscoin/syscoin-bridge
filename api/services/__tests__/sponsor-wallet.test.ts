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
  Model.exists = jest.fn();
  Model.deleteOne = jest.fn();
  return {
    __esModule: true,
    default: Model,
  };
});

jest.mock("syscoinjs-lib", () => ({
  syscoin: jest.fn(),
  utils: {
    BN: jest.fn(function (this: any, value: string | number) {
      this.value = value;
    }),
    syscoinNetworks: {
      mainnet: {},
      testnet: {},
    },
    bitcoinjs: {
      address: {
        toOutputScript: jest.fn(() => Buffer.from("51", "hex")),
      },
    },
    fetchBackendRawTx: jest.fn(),
    exportPsbtToJson: jest.fn(),
    importPsbtFromJson: jest.fn(),
    signWithWIF: jest.fn(),
    sendRawTransaction: jest.fn(),
  },
}));

import SponsorWalletTransactions from "models/sponsor-wallet-transactions";
import SponsorUtxoReservation from "models/sponsor-utxo-reservation";
import { syscoin, utils as syscoinUtils } from "syscoinjs-lib";
import SponsorWalletService, {
  SponsorshipInProgressError,
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



  describe("sponsored UTXO transactions", () => {
    beforeEach(() => {
      process.env.UTXO_SPONSOR_ADDRESS = "sys1sponsor";
      process.env.UTXO_SPONSOR_WIF = "sponsor-wif";
    });

    it("returns an existing sponsored mint without reserving another UTXO", async () => {
      SponsorWalletTransactionsMock.findOne.mockResolvedValue({
        status: "pending",
        transaction: { hash: "mint-txid" },
      });

      const service = new SponsorWalletService();
      await expect(
        service.sponsorUtxoMint(transfer, "0xfreeze")
      ).resolves.toEqual({
        sponsored: true,
        status: "pending",
        txid: "mint-txid",
      });
      expect(SponsorUtxoReservationMock.create).not.toHaveBeenCalled();
    });

    it("returns the same unsigned burn while its sponsor input is reserved", async () => {
      const expires = new Date(Date.now() + 60_000);
      SponsorWalletTransactionsMock.findOne.mockResolvedValue({
        status: "pending",
        reservationOwner: "owner",
        reservationExpiresAt: expires,
        transaction: {
          rawData: JSON.stringify({ psbt: "canonical", assets: "[]" }),
        },
      });

      const service = new SponsorWalletService();
      await expect(
        service.prepareSponsoredUtxoBurn(transfer)
      ).resolves.toEqual({
        sponsored: true,
        status: "signature-required",
        psbt: { psbt: "canonical", assets: "[]" },
      });
      expect(SponsorUtxoReservationMock.create).not.toHaveBeenCalled();
    });

    it("releases the sponsor output after preparing an unsigned burn", async () => {
      const service = new SponsorWalletService() as any;
      const placeholder = {
        _id: "placeholder-id",
        reservationOwner: "owner",
        reservationExpiresAt: new Date(Date.now() + 60_000),
        transaction: {},
      };
      const exported = { psbt: "canonical", assets: "[]" };

      jest.spyOn(service, "getUtxoSponsorConfig").mockReturnValue({
        sponsorAddress: "sys1sponsor",
        sponsorWif: "sponsor-wif",
      });
      jest
        .spyOn(service, "getExistingUtxoSponsorship")
        .mockResolvedValue(null);
      jest
        .spyOn(service, "claimUtxoSponsorPlaceholder")
        .mockResolvedValue(placeholder);
      jest.spyOn(service, "reserveSponsorUtxo").mockResolvedValue({
        key: "sponsor-txid:0",
        utxo: { txid: "sponsor-txid", vout: 0, value: "10000" },
      });
      jest
        .spyOn(service, "buildSponsoredBurn")
        .mockResolvedValue({ psbt: {}, assets: [] });
      jest
        .spyOn(service, "getUserInputFingerprint")
        .mockReturnValue("fingerprint");
      (syscoinUtils.exportPsbtToJson as jest.Mock<any>).mockReturnValue(
        exported
      );
      const store = jest
        .spyOn(service, "storePreparedUtxoBurn")
        .mockResolvedValue(undefined);
      const release = jest
        .spyOn(service, "releaseSponsorUtxoReservation")
        .mockResolvedValue(undefined);

      await expect(service.prepareSponsoredUtxoBurn(transfer)).resolves.toEqual(
        {
          sponsored: true,
          status: "signature-required",
          psbt: exported,
        }
      );

      expect(store).toHaveBeenCalledWith(
        placeholder,
        "fingerprint",
        "sponsor-txid:0",
        exported
      );
      expect(release).toHaveBeenCalledWith("sponsor-txid:0", transfer.id);
    });

    it("reserves the prepared sponsor input only after validating the user signature", async () => {
      const service = new SponsorWalletService() as any;
      const placeholder = {
        _id: "placeholder-id",
        transferId: transfer.id,
        reservationOwner: "owner",
        reservationExpiresAt: new Date(Date.now() + 60_000),
        utxoReservationKey: "sponsor-txid:0",
        transaction: {
          rawData: JSON.stringify({ psbt: "canonical", assets: "[]" }),
        },
      };
      const signed = { txid: "burn-txid", rawTransaction: "00" };
      const order: string[] = [];

      SponsorWalletTransactionsMock.findOne.mockResolvedValue(placeholder);
      (syscoinUtils.importPsbtFromJson as jest.Mock<any>).mockReturnValue({
        psbt: {},
      });
      jest.spyOn(service, "getUtxoSponsorConfig").mockReturnValue({
        sponsorAddress: "sys1sponsor",
        sponsorWif: "sponsor-wif",
      });
      jest
        .spyOn(service, "mergeUserSignatures")
        .mockImplementation(() => order.push("validate"));
      const reserve = jest
        .spyOn(service, "reserveSponsorUtxo")
        .mockImplementation(async () => {
          order.push("reserve");
          return {
            key: "sponsor-txid:0",
            utxo: { txid: "sponsor-txid", vout: 0, value: "10000" },
          };
        });
      jest.spyOn(service, "signPreparedUtxo").mockResolvedValue(signed);
      jest
        .spyOn(service, "beginUtxoSponsorBroadcast")
        .mockResolvedValue(placeholder);
      jest
        .spyOn(service, "markSponsorUtxoBroadcasting")
        .mockResolvedValue(undefined);
      jest
        .spyOn(service, "broadcastPreparedUtxo")
        .mockResolvedValue(undefined);
      jest.spyOn(service, "markSponsorUtxoSpent").mockResolvedValue(undefined);
      jest
        .spyOn(service, "commitUtxoSponsorTransaction")
        .mockResolvedValue(placeholder);

      await expect(
        service.submitSponsoredUtxoBurn(transfer, {
          psbt: "signed",
          assets: "[]",
        })
      ).resolves.toEqual({
        sponsored: true,
        status: "pending",
        txid: "burn-txid",
      });

      expect(order).toEqual(["validate", "reserve"]);
      expect(reserve).toHaveBeenCalledWith(
        "sys1sponsor",
        transfer.id,
        1,
        "sponsor-txid:0"
      );
    });

    it("stores a signed mint before making its sponsor lease permanent", async () => {
      const service = new SponsorWalletService() as any;
      const placeholder = {
        _id: "placeholder-id",
        reservationOwner: "owner",
        reservationExpiresAt: new Date(Date.now() + 60_000),
        transaction: {},
      };
      const signed = { txid: "mint-txid", rawTransaction: "00" };
      const order: string[] = [];

      jest.spyOn(service, "getUtxoSponsorConfig").mockReturnValue({
        sponsorAddress: "sys1sponsor",
        sponsorWif: "sponsor-wif",
      });
      jest
        .spyOn(service, "getExistingUtxoSponsorship")
        .mockResolvedValue(null);
      jest
        .spyOn(service, "claimUtxoSponsorPlaceholder")
        .mockResolvedValue(placeholder);
      jest.spyOn(service, "reserveSponsorUtxo").mockResolvedValue({
        key: "sponsor-txid:0",
        utxo: { txid: "sponsor-txid", vout: 0, value: "10000" },
      });
      jest
        .spyOn(service, "prepareSponsoredMint")
        .mockResolvedValue({ psbt: {} });
      jest.spyOn(service, "signPreparedUtxo").mockResolvedValue(signed);
      const begin = jest
        .spyOn(service, "beginUtxoSponsorBroadcast")
        .mockImplementation(async () => {
          order.push("persist");
          return placeholder;
        });
      const lock = jest
        .spyOn(service, "markSponsorUtxoBroadcasting")
        .mockImplementation(async () => {
          order.push("lock");
        });
      jest.spyOn(service, "broadcastPreparedUtxo").mockResolvedValue(undefined);
      jest.spyOn(service, "markSponsorUtxoSpent").mockResolvedValue(undefined);
      jest
        .spyOn(service, "commitUtxoSponsorTransaction")
        .mockResolvedValue(placeholder);

      await service.sponsorUtxoMint(transfer, "0xfreeze");

      expect(order).toEqual(["persist", "lock"]);
      expect(begin).toHaveBeenCalledWith(
        placeholder,
        signed,
        "sponsor-txid:0"
      );
      expect(lock).toHaveBeenCalledWith("sponsor-txid:0", transfer.id);
    });

    it("restores the permanent sponsor lease before recovering a broadcast", async () => {
      const service = new SponsorWalletService() as any;
      const transaction = {
        transferId: transfer.id,
        reservationPhase: "broadcasting",
        utxoReservationKey: "sponsor-txid:0",
        transaction: { hash: "burn-txid", rawData: "00" },
      };
      const order: string[] = [];
      const lock = jest
        .spyOn(service, "markSponsorUtxoBroadcasting")
        .mockImplementation(async () => {
          order.push("lock");
        });
      jest
        .spyOn(service, "broadcastPreparedUtxo")
        .mockImplementation(async () => {
          order.push("broadcast");
        });
      jest
        .spyOn(service, "markSponsorUtxoSpent")
        .mockImplementation(async () => {
          order.push("spent");
        });
      jest
        .spyOn(service, "commitUtxoSponsorTransaction")
        .mockImplementation(async () => {
          order.push("commit");
          return transaction;
        });

      await service.recoverUtxoSponsorBroadcast(transaction);

      expect(order).toEqual(["lock", "broadcast", "spent", "commit"]);
      expect(lock).toHaveBeenCalledWith("sponsor-txid:0", transfer.id);
    });

    it("recreates an expired sponsor lease before recovering a broadcast", async () => {
      const service = new SponsorWalletService() as any;
      const transaction = {
        transferId: transfer.id,
        reservationPhase: "broadcasting",
        utxoReservationKey: "sponsor-txid:0",
        transaction: { hash: "burn-txid", rawData: "00" },
      };
      const order: string[] = [];

      jest.spyOn(service, "getUtxoSponsorConfig").mockReturnValue({
        sponsorAddress: "sys1sponsor",
        sponsorWif: "sponsor-wif",
      });
      jest
        .spyOn(service, "markSponsorUtxoBroadcasting")
        .mockImplementationOnce(async () => {
          order.push("missing");
          throw new SponsorshipInProgressError();
        })
        .mockImplementationOnce(async () => {
          order.push("lock");
        });
      const reserve = jest
        .spyOn(service, "reserveSponsorUtxo")
        .mockImplementation(async () => {
          order.push("reserve");
          return {
            key: "sponsor-txid:0",
            utxo: { txid: "sponsor-txid", vout: 0, value: "10000" },
          };
        });
      jest
        .spyOn(service, "broadcastPreparedUtxo")
        .mockImplementation(async () => {
          order.push("broadcast");
        });
      jest.spyOn(service, "markSponsorUtxoSpent").mockResolvedValue(undefined);
      jest
        .spyOn(service, "commitUtxoSponsorTransaction")
        .mockResolvedValue(transaction);

      await service.recoverUtxoSponsorBroadcast(transaction);

      expect(order).toEqual(["missing", "reserve", "lock", "broadcast"]);
      expect(reserve).toHaveBeenCalledWith(
        "sys1sponsor",
        transfer.id,
        1,
        "sponsor-txid:0"
      );
    });

    it("accepts an already-spent reservation while recovering a broadcast", async () => {
      SponsorUtxoReservationMock.updateOne.mockResolvedValue({
        matchedCount: 0,
        modifiedCount: 0,
      });
      SponsorUtxoReservationMock.exists.mockResolvedValue({
        _id: "reservation",
      });

      const service = new SponsorWalletService() as any;
      await expect(
        service.markSponsorUtxoBroadcasting(
          "sponsor-txid:0",
          transfer.id
        )
      ).resolves.toBeUndefined();

      expect(SponsorUtxoReservationMock.exists).toHaveBeenCalledWith({
        key: "sponsor-txid:0",
        transferId: transfer.id,
        status: "spent",
      });
    });

    it("keeps a spent reservation durable for delayed recovery", async () => {
      SponsorUtxoReservationMock.updateOne.mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 1,
      });

      const service = new SponsorWalletService() as any;
      await service.markSponsorUtxoSpent("sponsor-txid:0", transfer.id);

      expect(SponsorUtxoReservationMock.updateOne).toHaveBeenCalledWith(
        {
          key: "sponsor-txid:0",
          transferId: transfer.id,
          status: { $in: ["broadcasting", "spent"] },
        },
        {
          $set: { status: "spent" },
          $unset: { expiresAt: "" },
        }
      );
    });

    it("rejects a changed unsigned transaction before adding sponsor signatures", () => {
      const service = new SponsorWalletService() as any;
      const input = {
        hash: Buffer.alloc(32, 1),
        index: 0,
        sequence: 0xfffffffd,
      };
      const canonical = {
        version: 141,
        locktime: 0,
        txInputs: [input],
        txOutputs: [{ script: Buffer.from("00", "hex"), value: BigInt(1) }],
        data: { inputs: [{}] },
        updateInput: jest.fn(),
      };
      const changed = {
        ...canonical,
        txOutputs: [{ script: Buffer.from("00", "hex"), value: BigInt(2) }],
      };

      expect(() =>
        service.mergeUserSignatures(canonical, changed, "sponsor:0")
      ).toThrow("does not match sponsor preparation");
    });

    it("rejects native user value that would increase sponsor change", () => {
      const service = new SponsorWalletService() as any;
      const psbt = {
        txOutputs: [
          { script: Buffer.from("51", "hex"), value: BigInt(10_001) },
          { script: Buffer.from("52", "hex"), value: BigInt(1) },
        ],
      };

      expect(() =>
        service.assertSponsorDoesNotReceiveUserNative(
          psbt,
          "sys1sponsor",
          { value: "10000" }
        )
      ).toThrow("must use the user-funded path");
    });

    it("allows sponsor change no greater than the sponsor input", () => {
      const service = new SponsorWalletService() as any;
      const psbt = {
        txOutputs: [
          { script: Buffer.from("51", "hex"), value: BigInt(9_999) },
          { script: Buffer.from("52", "hex"), value: BigInt(1) },
        ],
      };

      expect(() =>
        service.assertSponsorDoesNotReceiveUserNative(
          psbt,
          "sys1sponsor",
          { value: "10000" }
        )
      ).not.toThrow();
    });

    it("marks observed sponsored UTXO transactions successful", async () => {
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
        action: { $in: ["mint-sysx", "burn-sysx"] },
      });
      expect(record.status).toBe("success");
      expect(record.transaction.confirmedHash).toBe("utxo-txid");
    });
  });
});
