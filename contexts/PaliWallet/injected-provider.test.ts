import { describe, expect, it, jest } from "@jest/globals";

import {
  getPaliNotificationEvent,
  isMatchingPaliEthereumProvider,
  isModernPaliProvider,
  selectPaliUtxoProvider,
} from "./injected-provider";

const stable = { wallet: "pali-v2", request: jest.fn() };
const canary = { wallet: "pali-canary:pali-v2", request: jest.fn() };
const metamask = { wallet: "metamask", request: jest.fn(), isMetaMask: true };

describe("injected Pali wallet selection", () => {
  it("pairs the UTXO provider with whichever Pali channel owns legacy Ethereum", () => {
    expect(selectPaliUtxoProvider(stable, canary, canary)).toBe(canary);
    expect(selectPaliUtxoProvider(stable, canary, stable)).toBe(stable);
    expect(selectPaliUtxoProvider(stable, undefined, canary)).toBeUndefined();
  });

  it("re-evaluates the UTXO fallback when a complete pair becomes visible", () => {
    expect(selectPaliUtxoProvider(stable, canary, undefined)).toBe(stable);
    expect(selectPaliUtxoProvider(stable, canary, canary)).toBe(canary);
    expect(selectPaliUtxoProvider(undefined, canary, metamask)).toBe(canary);
    expect(selectPaliUtxoProvider(stable, canary, metamask)).toBe(stable);
  });

  it("prefers production for UTXO with a separate MetaMask provider", () => {
    expect(selectPaliUtxoProvider(stable, canary, metamask)).toBe(stable);
  });

  it("recognizes Canary through its namespaced and legacy window keys", () => {
    expect(selectPaliUtxoProvider(undefined, canary, canary)).toBe(canary);
    expect(selectPaliUtxoProvider(canary, undefined, undefined)).toBe(canary);
    expect(selectPaliUtxoProvider(metamask, canary, undefined)).toBe(canary);
    expect(selectPaliUtxoProvider(metamask, undefined, undefined)).toBeUndefined();
  });

  it("matches only the selected Pali channel as the active EVM provider", () => {
    expect(isMatchingPaliEthereumProvider(canary, canary)).toBe(true);
    expect(isMatchingPaliEthereumProvider(stable, stable)).toBe(true);
    expect(isMatchingPaliEthereumProvider(stable, canary)).toBe(false);
    expect(isMatchingPaliEthereumProvider(canary, metamask)).toBe(false);
    expect(isMatchingPaliEthereumProvider(canary, undefined)).toBe(false);
    expect(isModernPaliProvider({ ...canary, request: undefined })).toBe(false);
  });

  it("listens to change notifications on the selected channel", () => {
    expect(getPaliNotificationEvent(stable.wallet)).toBe("paliNotification");
    expect(getPaliNotificationEvent(canary.wallet)).toBe("pali-canary:paliNotification");
  });
});
