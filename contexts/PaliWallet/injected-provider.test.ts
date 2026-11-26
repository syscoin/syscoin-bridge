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
    expect(selectPaliUtxoProvider(stable, canary, canary, false)).toBe(canary);
    expect(selectPaliUtxoProvider(stable, canary, stable, false)).toBe(stable);
    expect(selectPaliUtxoProvider(stable, undefined, canary, true)).toBeUndefined();
  });

  it("waits through the UTXO-first injection phase before falling back", () => {
    expect(selectPaliUtxoProvider(stable, canary, undefined, false)).toBeUndefined();
    expect(selectPaliUtxoProvider(stable, canary, undefined, true)).toBe(stable);
    expect(selectPaliUtxoProvider(undefined, canary, metamask, false)).toBeUndefined();
    expect(selectPaliUtxoProvider(undefined, canary, metamask, true)).toBe(canary);
  });

  it("prefers production for UTXO with a separate MetaMask provider", () => {
    expect(selectPaliUtxoProvider(stable, canary, metamask, false)).toBe(stable);
  });

  it("recognizes Canary through its namespaced and legacy window keys", () => {
    expect(selectPaliUtxoProvider(undefined, canary, canary, false)).toBe(canary);
    expect(selectPaliUtxoProvider(canary, undefined, undefined, true)).toBe(canary);
    expect(selectPaliUtxoProvider(metamask, canary, undefined, true)).toBe(canary);
    expect(selectPaliUtxoProvider(metamask, undefined, undefined, true)).toBeUndefined();
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
