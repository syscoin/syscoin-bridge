import { describe, expect, it, jest } from "@jest/globals";

import {
  clearConnectValidateDraft,
  readConnectValidateDraft,
  writeConnectValidateDraft,
} from "./connect-validate-draft";

const createStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: jest.fn((key: string) => values.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => values.set(key, value)),
    removeItem: jest.fn((key: string) => values.delete(key)),
  };
};

describe("connect and validate draft storage", () => {
  it("restores both wallet selections together", () => {
    const storage = createStorage();
    const draft = {
      amount: "0.1",
      nevmAddress: "0x6781dd2b72002f1fb37e7415479cbf5ffe828bfb",
      utxoAddress: "tsys1q56292azekef7fcnydp5v6mwrm5w7cacw9ahy70",
      utxoXpub: "upub-selected-account",
      utxoAssetType: "sys" as const,
    };

    writeConnectValidateDraft(storage, draft);

    expect(readConnectValidateDraft(storage)).toEqual(draft);
  });

  it("ignores malformed stored data", () => {
    const storage = createStorage();
    storage.setItem("syscoin-bridge-connect-draft-v1", "not-json");

    expect(readConnectValidateDraft(storage)).toEqual({});
  });

  it("clears the draft after leaving the new-transfer routes", () => {
    const storage = createStorage();
    writeConnectValidateDraft(storage, { nevmAddress: "0x123" });

    clearConnectValidateDraft(storage);

    expect(readConnectValidateDraft(storage)).toEqual({});
  });
});
