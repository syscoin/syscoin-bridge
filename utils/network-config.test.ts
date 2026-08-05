import { describe, expect, it } from "@jest/globals";
import {
  getSyscoinChainId,
  isSyscoinTestnetHost,
  resolveSyscoinIsTestnet,
} from "./network-config";

describe("Syscoin network configuration", () => {
  it("treats the configured NEVM testnet chain as authoritative", () => {
    expect(
      resolveSyscoinIsTestnet({ isTestnet: false, chain_id: "0x1644" })
    ).toBe(true);
  });

  it("does not treat the mainnet chain as testnet", () => {
    expect(
      resolveSyscoinIsTestnet({ isTestnet: true, chain_id: "0x39" })
    ).toBe(false);
  });

  it("falls back to the explicit testnet flag without a known chain", () => {
    expect(resolveSyscoinIsTestnet({ isTestnet: true })).toBe(true);
  });

  it("returns the matching Syscoin UTXO and NEVM chain id", () => {
    expect(getSyscoinChainId(false)).toBe(57);
    expect(getSyscoinChainId(true)).toBe(5700);
  });

  it("recognizes the Tanenbaum and Vercel testnet hosts", () => {
    expect(isSyscoinTestnetHost("bridge.tanenbaum.io")).toBe(true);
    expect(
      isSyscoinTestnetHost(
        "bridge-testnet-eavgyydou-sys-labs-1f6f97e5.vercel.app"
      )
    ).toBe(true);
  });

  it("does not treat the mainnet hosts as testnet", () => {
    expect(isSyscoinTestnetHost("bridge.syscoin.org")).toBe(false);
    expect(
      isSyscoinTestnetHost(
        "syscoin-bridge-git-main-sys-labs-1f6f97e5.vercel.app"
      )
    ).toBe(false);
  });
});
