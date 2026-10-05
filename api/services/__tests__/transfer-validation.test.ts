import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import {
  COMMON_STATUS,
  ETH_TO_SYS_TRANSFER_STATUS,
  ITransfer,
  SYS_TO_ETH_TRANSFER_STATUS,
} from "@contexts/Transfer/types";
import {
  assertNewTransfer,
  assertTransferIdentityUnchanged,
  assertValidTransferPayload,
  TransferValidationError,
} from "../transfer-validation";

const mainnetAddress = "sys1qqyqszqgpqyqszqgpqyqszqgpqyqszqgpvew0kr";
const testnetAddress = "tsys1qqyqszqgpqyqszqgpqyqszqgpqyqszqgpmtdx9f";
const transfer: ITransfer = {
  id: "e8d6267c-f818-41b3-9ee0-09b71179c438",
  type: "sys-to-nevm",
  status: SYS_TO_ETH_TRANSFER_STATUS.BURN_SYS,
  amount: "1",
  logs: [],
  createdAt: 1,
  utxoAddress: mainnetAddress,
  nevmAddress: "0x28bD37C0926575f2568ea8f297c0745EF16174Ab",
  version: "v2",
  agreedToTerms: true,
};

describe("client transfer validation", () => {
  const originalTestnet = process.env.IS_TESTNET;
  beforeEach(() => {
    process.env.IS_TESTNET = "false";
  });
  afterEach(() => {
    if (originalTestnet === undefined) delete process.env.IS_TESTNET;
    else process.env.IS_TESTNET = originalTestnet;
  });

  it("accepts a mainnet SYS transfer", () => {
    expect(() => assertValidTransferPayload(transfer)).not.toThrow();
    expect(() => assertNewTransfer(transfer)).not.toThrow();
  });

  it("validates UTXO addresses against the deployed network", () => {
    expect(() =>
      assertValidTransferPayload({ ...transfer, utxoAddress: testnetAddress })
    ).toThrow(TransferValidationError);
    process.env.IS_TESTNET = "true";
    expect(() =>
      assertValidTransferPayload({ ...transfer, utxoAddress: testnetAddress })
    ).not.toThrow();
    expect(() => assertValidTransferPayload(transfer)).toThrow(
      TransferValidationError
    );
  });

  it.each([
    null,
    [],
    "transfer",
    { ...transfer, id: { $ne: null } },
    { ...transfer, id: "" },
    { ...transfer, type: "unsupported" },
    { ...transfer, status: "unsupported" },
    { ...transfer, status: ETH_TO_SYS_TRANSFER_STATUS.MINT_SYSX },
    { ...transfer, nevmAddress: "0xattackercreate2" },
    { ...transfer, utxoAddress: "sys1attackercreate2" },
    { ...transfer, utxoXpub: { $ne: null } },
    { ...transfer, utxoXpub: "../../../api/status" },
    { ...transfer, utxoXpub: "xpub-invalid" },
    { ...transfer, agreedToTerms: false },
    { ...transfer, useSysx: "false" },
    { ...transfer, utxoAssetType: "other" },
    { ...transfer, logs: {} },
  ])("rejects malformed payload %#", (payload) => {
    expect(() => assertValidTransferPayload(payload as ITransfer)).toThrow(
      TransferValidationError
    );
  });

  it.each(["0", "-1", "1e4", "0.000000001", "NaN", "01", 1, {}])(
    "rejects invalid amount %p",
    (amount) => {
      expect(() =>
        assertValidTransferPayload({ ...transfer, amount } as ITransfer)
      ).toThrow(TransferValidationError);
    }
  );

  it.each(["0.00000001", "168142.89899999", "1.00000000"])(
    "accepts exact valid decimal amount %s",
    (amount) => {
      expect(() => assertValidTransferPayload({ ...transfer, amount })).not.toThrow();
    }
  );

  it.each([
    { useSysx: true },
    { utxoAssetType: "sysx" as const },
    { useSysx: true, utxoAssetType: "sysx" as const },
  ])("allows SYSX transfers to start at burn-sysx (%p)", (selection) => {
    expect(() =>
      assertNewTransfer({
        ...transfer,
        ...selection,
        status: SYS_TO_ETH_TRANSFER_STATUS.BURN_SYSX,
      })
    ).not.toThrow();
    expect(() => assertNewTransfer({ ...transfer, ...selection })).toThrow(
      TransferValidationError
    );
  });

  it("allows NEVM transfers to start at freeze-burn-sys", () => {
    const nevmTransfer: ITransfer = {
      ...transfer,
      type: "nevm-to-sys",
      status: ETH_TO_SYS_TRANSFER_STATUS.FREEZE_BURN_SYS,
    };
    expect(() => assertValidTransferPayload(nevmTransfer)).not.toThrow();
    expect(() => assertNewTransfer(nevmTransfer)).not.toThrow();
  });

  const validLog = {
    status: SYS_TO_ETH_TRANSFER_STATUS.BURN_SYS,
    date: 1,
    payload: { message: "Burn SYS", data: { tx: "a".repeat(64) } },
  };

  it("rejects fabricated completed records and logs on creation", () => {
    expect(() =>
      assertNewTransfer({ ...transfer, status: COMMON_STATUS.COMPLETED })
    ).toThrow(TransferValidationError);
    expect(() => assertNewTransfer({ ...transfer, logs: [validLog] })).toThrow(
      TransferValidationError
    );
  });

  it("requires UUIDs on creation without invalidating existing legacy IDs", () => {
    const legacyTransfer = { ...transfer, id: "legacy-transfer-id" };
    expect(() => assertNewTransfer(legacyTransfer)).toThrow(TransferValidationError);
    expect(() => assertValidTransferPayload(legacyTransfer)).not.toThrow();
  });

  it("accepts existing transaction/error logs and retry states", () => {
    expect(() =>
      assertValidTransferPayload({
        ...transfer,
        status: COMMON_STATUS.ERROR,
        logs: [
          validLog,
          {
            status: COMMON_STATUS.ERROR,
            date: 2,
            payload: {
              message: "Please retry",
              data: { error: { message: "RPC temporarily unavailable" } },
              previousStatus: SYS_TO_ETH_TRANSFER_STATUS.CONFIRM_BURN_SYS,
            },
          },
        ],
      })
    ).not.toThrow();
  });

  it.each([
    null,
    {},
    { ...validLog, date: "today" },
    { ...validLog, date: -1 },
    { ...validLog, status: "unsupported" },
    { ...validLog, payload: null },
    { ...validLog, payload: { data: {} } },
    { ...validLog, payload: { message: "Burn", data: null } },
    { ...validLog, payload: { message: "Burn", data: { tx: { $ne: null } } } },
    { ...validLog, payload: { message: "Burn", data: { hash: [] } } },
    { ...validLog, payload: { message: "Burn", data: { transactionHash: 1 } } },
    { ...validLog, payload: { message: "Burn", data: { tx: "../../../api/status" } } },
    { ...validLog, payload: { message: "Burn", data: { tx: "0x" + "a".repeat(64) } } },
    { ...validLog, payload: { message: "Burn", data: { txid: "%252fapi%252fstatus" } } },
    { ...validLog, payload: { message: "Burn", data: { hash: "a".repeat(64) } } },
    { ...validLog, payload: { message: "Burn", data: { transactionHash: "0x00" } } },
  ])("rejects malformed log %#", (log) => {
    expect(() =>
      assertValidTransferPayload({ ...transfer, logs: [log] } as ITransfer)
    ).toThrow(TransferValidationError);
  });

  it.each([
    { type: "nevm-to-sys" as const },
    { utxoAddress: testnetAddress },
    { utxoXpub: "a-different-account" },
    { nevmAddress: "0x1111111111111111111111111111111111111111" },
    { amount: "2" },
    { useSysx: true },
    { utxoAssetType: "sysx" as const },
  ])("prevents changing transfer identity (%p)", (change) => {
    expect(() =>
      assertTransferIdentityUnchanged({ ...transfer, ...change }, transfer)
    ).toThrow(TransferValidationError);
  });

  it("allows cosmetic address/amount changes and absent default asset flags", () => {
    expect(() =>
      assertTransferIdentityUnchanged(
        {
          ...transfer,
          nevmAddress: transfer.nevmAddress!.toLowerCase(),
          amount: "1.00000000",
          utxoXpub: "",
          useSysx: false,
          utxoAssetType: "sys",
          status: SYS_TO_ETH_TRANSFER_STATUS.CONFIRM_BURN_SYS,
          logs: [validLog],
        },
        transfer
      )
    ).not.toThrow();
  });
});
