import { describe, expect, it } from "@jest/globals";
import { readStoredTransfers } from "./stored-transfers";

const createStorage = (entries: Record<string, string>) => {
  const keys = Object.keys(entries);
  return {
    length: keys.length,
    key: (index: number) => keys[index] ?? null,
    getItem: (key: string) => entries[key] ?? null,
  };
};

describe("stored transfers", () => {
  it("does not parse transfer write capabilities as JSON", () => {
    const transfer = { id: "transfer-id", status: "initialize" };
    const storage = createStorage({
      "transfer-transfer-id": JSON.stringify(transfer),
      "transfer-write-token-transfer-id": "not-json-a-write-token",
    });

    expect(readStoredTransfers(storage)).toEqual([transfer]);
  });

  it("ignores corrupt and unrelated local storage entries", () => {
    const storage = createStorage({
      "transfer-corrupt": "not-json",
      settings: JSON.stringify({ theme: "dark" }),
    });

    expect(readStoredTransfers(storage)).toEqual([]);
  });
});
