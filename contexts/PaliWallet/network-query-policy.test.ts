import { describe, expect, it } from "@jest/globals";
import {
  getPaliNevmQueryAction,
  isPaliV2UtxoMode,
} from "./network-query-policy";

describe("Pali network query policy", () => {
  it("disables the injected EVM provider when Pali v2 is on UTXO", () => {
    expect(isPaliV2UtxoMode("v2", true, true)).toBe(true);
    expect(isPaliV2UtxoMode("v2", true, false)).toBe(false);
    expect(isPaliV2UtxoMode("v1", undefined, true)).toBe(false);
  });

  it("does not refresh EVM queries while switching to UTXO", () => {
    expect(getPaliNevmQueryAction(true, false, "bitcoin")).toBe("cancel");
  });

  it("refreshes EVM queries only when EVM is active", () => {
    expect(getPaliNevmQueryAction(true, false, null)).toBe("refresh");
    expect(getPaliNevmQueryAction(true, true, null)).toBe("cancel");
    expect(getPaliNevmQueryAction(true, undefined, null)).toBe("none");
  });

  it("leaves MetaMask queries alone when Pali is not the EVM provider", () => {
    expect(getPaliNevmQueryAction(false, false, "bitcoin")).toBe("none");
    expect(getPaliNevmQueryAction(false, false, null)).toBe("none");
  });
});
