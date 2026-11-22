import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockFetchBackendSPVProof = jest.fn<any>();

jest.mock("syscoinjs-lib", () => {
  const library = jest.requireActual<typeof import("syscoinjs-lib")>("syscoinjs-lib");
  return {
    ...library,
    utils: { ...library.utils, fetchBackendSPVProof: mockFetchBackendSPVProof },
  };
});

import { SYSX_ASSET_GUID } from "@contexts/Transfer/constants";
import type { ITransfer } from "@contexts/Transfer/types";
import { SPVProof, utils as syscoinUtils } from "syscoinjs-lib";
import { assertSponsoredProofBurn, getCanonicalProof } from "../sponsor-proof";
import { syscoinTxIdFromWitnessStrippedHex } from "utils/syscoin-txid";

const transaction = "01000000";
const submittedProof = {
  transaction,
  chainlock: true,
} as SPVProof;

describe("canonical sponsored SPV proof", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("accepts a canonical backend proof without requiring a ChainLock", async () => {
    const canonicalProof = { ...submittedProof, chainlock: false };
    mockFetchBackendSPVProof.mockResolvedValue({
      result: canonicalProof,
    });

    await expect(getCanonicalProof(submittedProof)).resolves.toEqual({
      proof: canonicalProof,
      sourceTxHash: syscoinTxIdFromWitnessStrippedHex(transaction),
    });
  });

  it("returns a server-fetched proof for the same source transaction", async () => {
    const canonicalProof = {
      ...submittedProof,
      blockhash: "canonical-block",
    };
    mockFetchBackendSPVProof.mockResolvedValue({ result: canonicalProof });

    await expect(getCanonicalProof(submittedProof)).resolves.toEqual({
      proof: canonicalProof,
      sourceTxHash: syscoinTxIdFromWitnessStrippedHex(transaction),
    });
  });

  it("rejects a backend response for a different transaction", async () => {
    mockFetchBackendSPVProof.mockResolvedValue({
      result: { ...submittedProof, transaction: "02000000" },
    });

    await expect(
      getCanonicalProof(submittedProof)
    ).rejects.toThrow("does not match the source transaction");
  });
});

describe("sponsored proof burn amount", () => {
  const { bufferUtils } = require("syscointx-js");
  const recipient = `0x${"ab".repeat(20)}`;
  const makeBurn = (amount: string, assetGuid = SYSX_ASSET_GUID) => {
    const payload = Buffer.concat([
      bufferUtils.serializeAssetAllocations([{
        assetGuid,
        values: [{ n: 0, value: new syscoinUtils.BN(amount) }],
      }]),
      bufferUtils.serializeAllocationBurn({ ethaddress: Buffer.from(recipient.slice(2), "hex") }),
    ]);
    const tx = new syscoinUtils.bitcoinjs.Transaction();
    tx.version = 141;
    tx.addInput(Buffer.alloc(32, 1), 0);
    tx.addOutput(syscoinUtils.bitcoinjs.script.compile([0x6a, payload]), BigInt(0));
    return { transaction: tx.toHex() } as SPVProof;
  };

  it("checks the exact amount committed to the burn output against the configured threshold", () => {
    const transfer = { amount: "100", nevmAddress: recipient } as ITransfer;
    const minimum = BigInt("10000000000");
    expect(() => assertSponsoredProofBurn(transfer, makeBurn("10000000000"), minimum)).not.toThrow();
    expect(() => assertSponsoredProofBurn(transfer, makeBurn("9999999999"), minimum))
      .toThrow("does not match this transfer");
    expect(() => assertSponsoredProofBurn(transfer, makeBurn("10000000000", "123457"), minimum))
      .toThrow("does not match this transfer");
    expect(() => assertSponsoredProofBurn(
      { ...transfer, amount: "99.99999999" }, makeBurn("9999999999"), minimum
    )).toThrow("below the foundation proof sponsorship minimum");
  });
});
