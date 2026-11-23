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
const mockExportPsbtWithPrevouts = jest.fn<any>();

jest.mock("utils/get-web3", () => ({
  __esModule: true,
  default: mockWeb3,
}));

jest.mock("utils/psbt-prevouts", () => ({
  exportPsbtWithPrevouts: mockExportPsbtWithPrevouts,
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
  Model.updateMany = jest.fn();
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
  Model.find = jest.fn();
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
  SponsorNonceRecoveryError,
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


const proofRow = (nonce: number) => ({
  _id: `proof-${nonce}`,
  transferId: `transfer-${nonce}`,
  action: "submit-proofs",
  sourceTxHash: `source-${nonce}`,
  walletId: "0xSponsor",
  status: "pending",
  broadcastAt: new Date("2026-11-01T00:00:00Z"),
  transaction: {
    hash: `0xproof-${nonce}`,
    rawData: `0xproof-raw-${nonce}`,
    nonce,
  },
});

const mockBoundedRecoveryRows = (rows: unknown[]) => {
  const limit = jest.fn(async (count: number) => rows.slice(0, count));
  const sort = jest.fn(() => ({ limit }));
  SponsorWalletTransactionsMock.find.mockReturnValue({ sort });
  return { sort, limit };
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
    SponsorWalletTransactionsMock.updateMany.mockReset();
    SponsorWalletTransactionsMock.countDocuments.mockReset();
    SponsorWalletTransactionsMock.find.mockReset();
    SponsorWalletTransactionsMock.countDocuments.mockResolvedValue(0);
    SponsorWalletTransactionsMock.updateOne.mockResolvedValue({
      modifiedCount: 1,
    });
    SponsorWalletTransactionsMock.updateMany.mockResolvedValue({ modifiedCount: 0 });
    fetchBackendRawTxMock.mockReset().mockResolvedValue(null);
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
      mockBoundedRecoveryRows([lowerTransaction, existingTransaction]);
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
      expect(mockWeb3.eth.getTransaction).not.toHaveBeenCalled();
      expect(mockWeb3.eth.getTransactionCount).not.toHaveBeenCalled();
      expect(SponsorWalletTransactionsMock.updateOne).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({ status: "pending" }),
        })
      );
    });

    it("serves a visible accepted pending proof without scanning the nonce queue", async () => {
      const accepted = proofRow(1);
      const { transferId, sourceTxHash, walletId, transaction } = accepted;
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(accepted);
      mockWeb3.eth.getTransaction.mockResolvedValue({ ...transaction, blockNumber: null });
      mockWeb3.eth.getTransactionCount.mockResolvedValue(2);

      await expect(new SponsorWalletService().getExistingProofSponsorship(transferId, sourceTxHash))
        .resolves.toMatchObject({ transaction: { hash: transaction.hash } });

      expect(mockWeb3.eth.getTransaction).toHaveBeenCalledTimes(1);
      expect(mockWeb3.eth.getTransaction).toHaveBeenCalledWith(transaction.hash);
      expect(mockWeb3.eth.getTransactionCount).toHaveBeenCalledWith(walletId, "pending");
      expect(SponsorWalletTransactionsMock.find).not.toHaveBeenCalled();
      expect(SponsorWalletTransactionsMock.updateOne).not.toHaveBeenCalled();
      expect(mockWeb3.eth.sendSignedTransaction).not.toHaveBeenCalled();
    });

    it("rebroadcasts the exact durable bytes of an accepted pending proof that disappears", async () => {
      const accepted = proofRow(1);
      const { transferId, sourceTxHash, walletId, transaction } = accepted;
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(accepted);
      mockWeb3.eth.getTransaction.mockResolvedValue(null);
      mockWeb3.eth.getTransactionCount.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
      const recovery = mockBoundedRecoveryRows([accepted]);
      mockWeb3.eth.sendSignedTransaction.mockImplementation(() => successfulBroadcast(transaction.hash));

      await expect(new SponsorWalletService().getExistingProofSponsorship(transferId, sourceTxHash))
        .resolves.toMatchObject({ transaction: { hash: transaction.hash } });

      expect(SponsorWalletTransactionsMock.find).toHaveBeenCalledWith(expect.objectContaining({
        action: "submit-proofs",
        walletId,
        "transaction.nonce": { $type: "number", $gte: 1, $lte: 1 },
      }));
      expect(recovery.sort).toHaveBeenCalledWith({ "transaction.nonce": 1 });
      expect(recovery.limit).toHaveBeenCalledWith(16);
      expect(mockWeb3.eth.getTransaction).toHaveBeenCalledWith(transaction.hash);
      expect(mockWeb3.eth.sendSignedTransaction).toHaveBeenCalledTimes(1);
      expect(mockWeb3.eth.sendSignedTransaction).toHaveBeenCalledWith(transaction.rawData);
      expect(mockWeb3.eth.accounts.privateKeyToAccount).not.toHaveBeenCalled();
      expect(SponsorWalletTransactionsMock.updateOne).toHaveBeenLastCalledWith(
        { _id: accepted._id, "transaction.hash": transaction.hash },
        { $set: { broadcastAt: expect.any(Date) } }
      );
    });

    it("recovers a dropped predecessor even when the accepted target remains visible", async () => {
      const predecessor = proofRow(4);
      const target = proofRow(5);
      const { transferId, sourceTxHash, walletId, transaction } = target;
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(target);
      mockWeb3.eth.getTransaction.mockResolvedValue({ ...transaction, blockNumber: null });
      mockWeb3.eth.getTransactionCount.mockResolvedValueOnce(4).mockResolvedValueOnce(6);
      mockBoundedRecoveryRows([predecessor, target]);
      mockWeb3.eth.sendSignedTransaction.mockImplementation(() => successfulBroadcast(predecessor.transaction.hash));

      await expect(new SponsorWalletService().getExistingProofSponsorship(transferId, sourceTxHash))
        .resolves.toMatchObject({ transaction: { hash: transaction.hash } });

      expect(SponsorWalletTransactionsMock.find).toHaveBeenCalledWith(expect.objectContaining({
        walletId,
        "transaction.nonce": { $type: "number", $gte: 4, $lte: 5 },
      }));
      expect(mockWeb3.eth.sendSignedTransaction).toHaveBeenCalledTimes(1);
      expect(mockWeb3.eth.sendSignedTransaction).toHaveBeenCalledWith(predecessor.transaction.rawData);
      expect(mockWeb3.eth.getTransaction).toHaveBeenNthCalledWith(1, transaction.hash);
      expect(mockWeb3.eth.getTransaction).toHaveBeenNthCalledWith(2, transaction.hash);
    });

    it("reports a missing target behind the pending nonce instead of returning its stale hash", async () => {
      const target = proofRow(5);
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(target);
      mockWeb3.eth.getTransaction.mockResolvedValue(null);
      mockWeb3.eth.getTransactionCount.mockResolvedValue(6);

      await expect(new SponsorWalletService().getExistingProofSponsorship(target.transferId, target.sourceTxHash))
        .rejects.toBeInstanceOf(SponsorNonceRecoveryError);

      expect(SponsorWalletTransactionsMock.find).not.toHaveBeenCalled();
      expect(mockWeb3.eth.sendSignedTransaction).not.toHaveBeenCalled();
    });

    it("stops after a bounded prefix and allows the next request to resume it", async () => {
      const rows = Array.from({ length: 17 }, (_, i) => proofRow(i));
      const target = rows[16];
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(target);
      mockWeb3.eth.getTransaction.mockResolvedValue(null);
      let next = 0;
      mockWeb3.eth.getTransactionCount.mockImplementation(async () => next);
      mockWeb3.eth.sendSignedTransaction.mockImplementation((raw: string) => {
        const current = rows[next];
        expect(raw).toBe(current.transaction.rawData);
        next += 1;
        return successfulBroadcast(current.transaction.hash);
      });
      const recovery = mockBoundedRecoveryRows(rows);
      const service = new SponsorWalletService();
      const request = () => service.getExistingProofSponsorship(target.transferId, target.sourceTxHash);

      await expect(request()).rejects.toBeInstanceOf(SponsorshipInProgressError);
      expect(mockWeb3.eth.sendSignedTransaction).toHaveBeenCalledTimes(16);
      expect(recovery.limit).toHaveBeenCalledWith(16);
      expect(next).toBe(16);

      mockBoundedRecoveryRows([target]);
      await expect(request()).resolves.toMatchObject({ transaction: { hash: target.transaction.hash } });
      expect(mockWeb3.eth.sendSignedTransaction).toHaveBeenCalledTimes(17);
      expect(next).toBe(17);
    });

    it("records mined acceptance for a proof that predates the accepted timestamp", async () => {
      const accepted = { ...proofRow(1), broadcastAt: undefined };
      const { transferId, sourceTxHash, transaction } = accepted;
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(accepted);
      mockWeb3.eth.getTransaction.mockResolvedValue({ ...transaction, blockNumber: 100 });

      await expect(new SponsorWalletService().getExistingProofSponsorship(transferId, sourceTxHash))
        .resolves.toMatchObject({ transaction: { hash: transaction.hash } });

      expect(mockWeb3.eth.getTransaction).toHaveBeenCalledWith(transaction.hash);
      expect(mockWeb3.eth.getTransactionCount).not.toHaveBeenCalled();
      expect(SponsorWalletTransactionsMock.find).not.toHaveBeenCalled();
      expect(SponsorWalletTransactionsMock.updateOne).toHaveBeenCalledWith(
        { _id: accepted._id, "transaction.hash": transaction.hash },
        { $set: { broadcastAt: expect.any(Date) } }
      );
    });

    it("replays a successful row during new nonce allocation if the pending nonce rolls back", async () => {
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
      const service = new SponsorWalletService() as any;

      await expect(
        service.recoverSponsorNonceQueue("0xSponsor")
      ).resolves.toBe(2);

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
      mockBoundedRecoveryRows([committedDuplicate]);
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

    it("prepares an eligible unsigned burn without locking a shared output or input fingerprint", async () => {
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
      jest.spyOn(service, "getEligibleBurnInputs").mockResolvedValue([]);
      jest.spyOn(service, "selectPreparedSponsorUtxo").mockResolvedValue({
        txid: "sponsor-txid", vout: 0, value: "10000",
      });
      jest
        .spyOn(service, "buildSponsoredBurn")
        .mockResolvedValue({ psbt: {}, assets: [] });
      const fingerprint = jest.spyOn(service, "getUserInputFingerprint");
      mockExportPsbtWithPrevouts.mockResolvedValue(exported);
      const store = jest
        .spyOn(service, "storePreparedUtxoBurn")
        .mockResolvedValue(undefined);
      const reserve = jest.spyOn(service, "reserveSponsorUtxo");

      await expect(service.prepareSponsoredUtxoBurn(transfer)).resolves.toEqual(
        {
          sponsored: true,
          status: "signature-required",
          psbt: exported,
        }
      );

      expect(store).toHaveBeenCalledWith(
        placeholder,
        "sponsor-txid:0",
        exported
      );
      expect(reserve).not.toHaveBeenCalled();
      expect(fingerprint).not.toHaveBeenCalled();
    });

    it("rejects an unsigned preparation before claiming a placeholder if confirmed SYSX is insufficient", async () => {
      const service = new SponsorWalletService() as any;
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(null);
      (global.fetch as jest.Mock<any>).mockResolvedValue({
        ok: true,
        json: async () => [{
          txid: "11".repeat(32), vout: 0, confirmations: 1,
          assetInfo: { assetGuid: "123456", value: "99999999" },
        }],
      });
      const claim = jest.spyOn(service, "claimUtxoSponsorPlaceholder");
      await expect(service.prepareSponsoredUtxoBurn(transfer)).rejects.toThrow("Insufficient confirmed SYSX");
      expect(claim).not.toHaveBeenCalled();
      expect(SponsorUtxoReservationMock.create).not.toHaveBeenCalled();
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
        .mockImplementation(() => order.push("merge"));
      jest
        .spyOn(service, "validatePreparedUserSignatures")
        .mockImplementation(() => order.push("validate"));
      jest.spyOn(service, "getUserInputFingerprint").mockReturnValue("fingerprint");
      jest.spyOn(service, "claimSponsoredBurnSubmission").mockResolvedValue(placeholder);
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

      expect(order).toEqual(["merge", "validate", "reserve"]);
      expect(reserve).toHaveBeenCalledWith(
        "sys1sponsor",
        placeholder,
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
      expect(lock).toHaveBeenCalledWith(placeholder);
    });

    it("uses a compare-and-set claim to keep two signed submissions from sharing the preparation lease", async () => {
      const service = new SponsorWalletService() as any;
      SponsorWalletTransactionsMock.findOneAndUpdate
        .mockResolvedValueOnce({ reservationOwner: "submitter", reservationPhase: "signing" })
        .mockResolvedValueOnce(null);
      const prepared = { _id: "prepare-id", reservationOwner: "preparer" };
      await expect(service.claimSponsoredBurnSubmission(prepared)).resolves.toMatchObject({
        reservationOwner: "submitter", reservationPhase: "signing",
      });
      await expect(service.claimSponsoredBurnSubmission(prepared)).rejects.toBeInstanceOf(SponsorshipInProgressError);
      expect(SponsorWalletTransactionsMock.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ reservationOwner: "preparer", reservationPhase: "reserved" }),
        { $set: { reservationOwner: expect.any(String), reservationPhase: "signing" } },
        { new: true }
      );
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
      expect(lock).toHaveBeenCalledWith(transaction);
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
        transaction,
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
      const transaction = {
        transferId: transfer.id,
        utxoReservationKey: "sponsor-txid:0",
        reservationOwner: "owner",
        transaction: { hash: "burn-txid" },
      };
      await expect(
        service.markSponsorUtxoBroadcasting(transaction)
      ).resolves.toBeUndefined();

      expect(SponsorUtxoReservationMock.exists).toHaveBeenCalledWith({
        key: "sponsor-txid:0",
        transferId: transfer.id,
        reservationOwner: { $in: [null, "owner"] },
        $or: [
          { broadcastHash: "burn-txid" },
          { broadcastHash: { $exists: false } },
        ],
        status: "spent",
      });
    });

    it("keeps a spent reservation durable for delayed recovery", async () => {
      SponsorUtxoReservationMock.updateOne.mockResolvedValue({
        matchedCount: 1,
        modifiedCount: 1,
      });

      const service = new SponsorWalletService() as any;
      await service.markSponsorUtxoSpent({
        transferId: transfer.id,
        utxoReservationKey: "sponsor-txid:0",
        reservationOwner: "owner",
        transaction: { hash: "burn-txid" },
      });

      expect(SponsorUtxoReservationMock.updateOne).toHaveBeenCalledWith(
        {
          key: "sponsor-txid:0",
          transferId: transfer.id,
          reservationOwner: { $in: [null, "owner"] },
          $or: [
            { broadcastHash: "burn-txid" },
            { broadcastHash: { $exists: false } },
          ],
          status: { $in: ["broadcasting", "spent"] },
        },
        {
          $set: { status: "spent" },
          $unset: { expiresAt: "" },
        }
      );
    });

    it("retains the signed attempt and outpoint lease when the broadcast outcome is unknown", async () => {
      const service = new SponsorWalletService() as any;
      jest.spyOn(service, "broadcastPreparedUtxo").mockRejectedValue(new Error("response timed out"));
      const release = jest.spyOn(service, "clearConflictedUtxoBroadcast");
      await expect(service.finishUtxoSponsorBroadcast({
        utxoReservationKey: "sponsor-txid:0",
        transaction: { hash: "burn-txid", rawData: "00" },
      })).rejects.toThrow("response timed out");
      expect(release).not.toHaveBeenCalled();
      expect(SponsorWalletTransactionsMock.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("finishes durable conflict cleanup without releasing another attempt's lease", async () => {
      const service = new SponsorWalletService() as any;
      await service.clearConflictedUtxoBroadcast({
        _id: "failed-attempt",
        transferId: transfer.id,
        action: "burn-sysx",
        utxoReservationKey: "sponsor-txid:0",
        reservationOwner: "owner",
        transaction: { hash: "burn-txid" },
        utxoBroadcastConflict: { sponsoredTxid: "burn-txid", spenderTxid: "competing-txid", sponsorOutputSpent: false },
      });
      expect(SponsorUtxoReservationMock.deleteOne).toHaveBeenCalledWith({
        key: "sponsor-txid:0",
        transferId: transfer.id,
        reservationOwner: { $in: [null, "owner"] },
        $or: [
          { broadcastHash: "burn-txid" },
          { broadcastHash: { $exists: false } },
        ],
      });
      expect(SponsorWalletTransactionsMock.updateOne).toHaveBeenCalledWith(
        { _id: "failed-attempt", reservationPhase: "conflicted", "transaction.hash": "burn-txid" },
        expect.objectContaining({ $set: { transaction: {} } })
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
        _id: "transaction-id",
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
      expect(SponsorWalletTransactionsMock.updateOne).toHaveBeenCalledWith(
        { _id: "transaction-id", status: "pending", "transaction.hash": "utxo-txid" },
        { $set: { status: "success", "transaction.confirmedHash": "utxo-txid" } }
      );
    });
  });
});
