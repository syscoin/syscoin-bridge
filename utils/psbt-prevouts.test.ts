import { describe, expect, it, jest } from "@jest/globals";
import { Buffer as BrowserBuffer } from "buffer/";
import { utils as syscoinUtils } from "syscoinjs-lib";

import {
  attachPsbtPrevouts,
  fetchBridgeRawTransaction,
} from "./psbt-prevouts";

const createPreviousTransaction = () => {
  const transaction = new syscoinUtils.bitcoinjs.Transaction();
  transaction.addInput(Buffer.alloc(32), 0xffffffff);
  transaction.addOutput(Buffer.from("00140000000000000000000000000000000000000001", "hex"), BigInt(5_000));
  transaction.addOutput(Buffer.from("00140000000000000000000000000000000000000002", "hex"), BigInt(7_000));
  transaction.ins[0].witness = [Buffer.alloc(64, 1)];
  return transaction;
};

const createPsbt = (previousTransaction: any) => {
  const psbt = new syscoinUtils.bitcoinjs.Psbt({
    network: syscoinUtils.syscoinNetworks.testnet,
  });
  previousTransaction.outs.forEach((output: any, index: number) => {
    psbt.addInput({
      hash: previousTransaction.getHash(),
      index,
      witnessUtxo: output,
    });
  });
  psbt.addOutput({
    script: previousTransaction.outs[0].script,
    value: BigInt(11_000),
  });
  return psbt;
};

describe("attachPsbtPrevouts", () => {
  it("deduplicates and attaches txid-bound parent transactions", async () => {
    const previousTransaction = createPreviousTransaction();
    const psbt = createPsbt(previousTransaction);
    const fetchRawTransaction = jest
      .fn<any>()
      .mockResolvedValue({ hex: previousTransaction.toHex() });

    await attachPsbtPrevouts(psbt, fetchRawTransaction);

    expect(fetchRawTransaction).toHaveBeenCalledTimes(1);
    expect(fetchRawTransaction).toHaveBeenCalledWith(
      previousTransaction.getId()
    );
    expect(psbt.data.inputs).toHaveLength(2);
    for (const input of psbt.data.inputs) {
      const attachedParent =
        syscoinUtils.bitcoinjs.Transaction.fromBuffer(input.nonWitnessUtxo);
      expect(attachedParent.getId()).toBe(previousTransaction.getId());
      expect(attachedParent.hasWitnesses()).toBe(false);
    }
  });

  it("rejects a parent transaction that does not match the input txid", async () => {
    const psbt = createPsbt(createPreviousTransaction());
    const differentTransaction = createPreviousTransaction();
    differentTransaction.locktime = 1;

    await expect(
      attachPsbtPrevouts(psbt, async () => ({
        hex: differentTransaction.toHex(),
      }))
    ).rejects.toThrow("does not match its txid");
  });

  it("accepts bitcoinjs Uint8Array hashes with the browser Buffer polyfill", async () => {
    const previousTransaction = createPreviousTransaction();
    const psbt = createPsbt(previousTransaction);
    const rawTransactionHex = previousTransaction.toHex();
    const originalBuffer = global.Buffer;
    global.Buffer = BrowserBuffer as typeof Buffer;

    try {
      await expect(
        attachPsbtPrevouts(psbt, async () => ({
          hex: rawTransactionHex,
        }))
      ).resolves.toBe(psbt);
      expect(() => psbt.toBase64()).not.toThrow();
    } finally {
      global.Buffer = originalBuffer;
    }
  });

  it("does not refetch an already attached parent transaction", async () => {
    const previousTransaction = createPreviousTransaction();
    const psbt = createPsbt(previousTransaction);
    for (let index = 0; index < psbt.data.inputs.length; index += 1) {
      psbt.updateInput(index, {
        nonWitnessUtxo: previousTransaction.toBuffer(),
      });
    }
    const fetchRawTransaction = jest.fn<any>();

    await attachPsbtPrevouts(psbt, fetchRawTransaction);

    expect(fetchRawTransaction).not.toHaveBeenCalled();
  });
});

describe("fetchBridgeRawTransaction", () => {
  it("uses the same-origin transaction proxy", async () => {
    const txid = "ab".repeat(32);
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ hex: "00" }),
    } as Response);

    await expect(fetchBridgeRawTransaction(txid)).resolves.toEqual({
      hex: "00",
    });
    expect(fetchMock).toHaveBeenCalledWith(`/api/utxo/tx/${txid}`, {
      headers: { Accept: "application/json" },
    });

    fetchMock.mockRestore();
  });
});
