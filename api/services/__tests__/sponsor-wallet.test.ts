import { COMMON_STATUS, ITransfer } from "@contexts/Transfer/types";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockWeb3 = {
  eth: {
    accounts: {
      privateKeyToAccount: jest.fn(),
    },
    getBalance: jest.fn(),
    getGasPrice: jest.fn(),
    estimateGas: jest.fn(),
    getTransactionCount: jest.fn(),
    getTransactionReceipt: jest.fn(),
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
    this.save = jest.fn().mockResolvedValue(this);
  });
  Model.findOne = jest.fn();
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
import SponsorWalletService from "../sponsor-wallet";

const SponsorWalletTransactionsMock = SponsorWalletTransactions as any;
const SponsorUtxoReservationMock = SponsorUtxoReservation as any;
const SyscoinMock = syscoin as jest.Mock;
const fetchBackendRawTxMock = syscoinUtils.fetchBackendRawTx as jest.Mock;

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
    delete process.env.NEVM_SPONSOR_PRIVATE_KEY;
    delete process.env.UTXO_SPONSOR_ADDRESS;
    delete process.env.UTXO_SPONSOR_WIF;
    global.fetch = jest.fn();
  });

  describe("sponsorTransaction", () => {
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
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(null);
      SponsorWalletTransactionsMock.find.mockReturnValue({
        sort: () => ({
          limit: () => Promise.resolve([]),
        }),
      });
      const service = new SponsorWalletService();

      await expect(
        service.sponsorTransaction("transfer-1", {
          to: "0xRelay",
          data: "0xdata",
          value: 0,
        })
      ).resolves.toMatchObject({
        walletId: "0xSponsor",
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
    });
  });

  describe("sponsorUtxoClaimGas", () => {
    it("returns the existing claim gas transaction when one was already created", async () => {
      SponsorWalletTransactionsMock.findOne.mockResolvedValue({
        status: "pending",
        transaction: { hash: "utxo-txid" },
      });

      const service = new SponsorWalletService();

      await expect(service.sponsorUtxoClaimGas(transfer)).resolves.toEqual({
        funded: true,
        status: "pending",
        txid: "utxo-txid",
      });
    });

    it("skips funding when the destination already has enough claim gas", async () => {
      SponsorWalletTransactionsMock.findOne.mockResolvedValue(null);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ balance: "100000" }),
      });

      const service = new SponsorWalletService();

      await expect(service.sponsorUtxoClaimGas(transfer)).resolves.toEqual({
        funded: false,
        status: "skipped",
        amountSats: 0,
        balanceSats: 100_000,
        reason: "Destination UTXO address already has claim gas",
      });
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
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ balance: "0" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
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

      await expect(service.sponsorUtxoClaimGas(transfer)).resolves.toMatchObject(
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
      expect(SponsorUtxoReservationMock.updateOne).toHaveBeenCalledWith(
        { key: "small-utxo:1" },
        expect.objectContaining({
          $set: expect.objectContaining({ status: "spent" }),
        })
      );
      expect(SponsorUtxoReservationMock.deleteOne).toHaveBeenCalledWith({
        key: "small-utxo:1",
        status: "reserved",
      });
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
        this.save = jest.fn().mockRejectedValue({ code: 11000 });
      });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ balance: "0" }),
      });

      const service = new SponsorWalletService();

      await expect(service.sponsorUtxoClaimGas(transfer)).resolves.toEqual({
        funded: true,
        status: "pending",
        reason: "UTXO claim gas sponsorship is already in progress",
      });
      expect(SponsorUtxoReservationMock.create).not.toHaveBeenCalled();
    });
  });

  describe("updateSponsorWalletTransactionStatus", () => {
    it("looks up NEVM sponsor transactions by nested transaction hash", async () => {
      const record = {
        status: "pending",
        transaction: { hash: "0xabc", confirmedHash: "" },
        save: jest.fn().mockResolvedValue(undefined),
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
        save: jest.fn().mockResolvedValue(undefined),
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
