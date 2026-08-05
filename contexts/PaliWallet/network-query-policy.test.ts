import { describe, expect, it } from "@jest/globals";
import {
  isPaliV2UtxoMode,
  shouldRefreshNevmQueries,
} from "./network-query-policy";

describe("Pali network query policy", () => {
  it("disables the injected EVM provider when Pali v2 is on UTXO", () => {
    expect(isPaliV2UtxoMode("v2", true, true)).toBe(true);
    expect(isPaliV2UtxoMode("v2", true, false)).toBe(false);
    expect(isPaliV2UtxoMode("v1", undefined, true)).toBe(false);
  });

  it("does not refresh EVM queries while switching to UTXO", () => {
    expect(shouldRefreshNevmQueries(false, "bitcoin")).toBe(false);
  });

  it("refreshes EVM queries only when EVM is active", () => {
    expect(shouldRefreshNevmQueries(false, null)).toBe(true);
    expect(shouldRefreshNevmQueries(true, null)).toBe(false);
    expect(shouldRefreshNevmQueries(undefined, null)).toBe(false);
  });
});
