import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { utils as syscoinUtils } from "syscoinjs-lib";
import { getConfirmedUtxoBroadcastConflict } from "../sponsor-utxo-conflict";

const sponsorInput = "11".repeat(32);
const burnInput = "22".repeat(32);
const spenderTxid = "33".repeat(32);
const tx = new syscoinUtils.bitcoinjs.Transaction();
tx.addInput(Buffer.from(sponsorInput, "hex"), 0);
tx.addInput(Buffer.from(burnInput, "hex"), 1);
tx.addOutput(Buffer.from("51", "hex"), BigInt(1));
const checkConflict = () => getConfirmedUtxoBroadcastConflict(
  "https://blockbook.test", tx.toHex(), tx.getId(), `${sponsorInput}:0`
);

const mockBlockbook = (spentInput: string, confirmations: number, reportedIndex: number) => {
  jest.spyOn(global, "fetch").mockImplementation(async (request) => {
    const url = new URL(String(request));
    const txid = url.pathname.split("/").pop();
    const vout = txid === sponsorInput ? 0 : 1;
    const body = txid === spenderTxid
      ? { txid, confirmations, vin: [{ txid: spentInput, vout: reportedIndex }] }
      : { txid, confirmations: 100, vout: [{ n: vout,
        ...(txid === spentInput ? { spent: true, spentTxId: spenderTxid } : {}),
      }] };
    return new Response(JSON.stringify(body), { status: 200 });
  });
};

describe("sponsored UTXO broadcast conflicts", () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it("releases a still-unspent sponsor outpoint if a confirmed transaction consumed a user input", async () => {
    mockBlockbook(burnInput, 6, 1);
    await expect(checkConflict()).resolves.toEqual({ spenderTxid, sponsorOutputSpent: false });
  });

  it("marks a proven conflicting spend of the sponsor outpoint as spent", async () => {
    mockBlockbook(sponsorInput, 6, 0);
    await expect(checkConflict()).resolves.toEqual({ spenderTxid, sponsorOutputSpent: true });
  });

  it("requires confirmation depth and the exact spent outpoint", async () => {
    mockBlockbook(burnInput, 5, 1);
    await expect(checkConflict()).resolves.toBeNull();
    mockBlockbook(burnInput, 6, 0);
    await expect(checkConflict()).resolves.toBeNull();
  });
});
