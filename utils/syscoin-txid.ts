import { createHash } from "crypto";

/** Bitcoin/Syscoin txid (display hex) from witness-stripped serialization. */
export function syscoinTxIdFromWitnessStrippedHex(txHex: string): string {
  const hex = txHex.startsWith("0x") ? txHex.slice(2) : txHex;
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error("Invalid witness-stripped transaction hex");
  }
  const firstHash = createHash("sha256").update(hex, "hex").digest("hex");
  const hash = createHash("sha256").update(firstHash, "hex").digest("hex");
  return hash.match(/.{2}/g)!.reverse().join("");
}
