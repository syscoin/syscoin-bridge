import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  clearActiveTransferWriteTokensForTests,
  getOrCreateTransferWriteToken,
  getTransferWriteToken,
} from "./transfer-write-token";

const values = new Map<string, string>();
const storage = {
  getItem: jest.fn((key: string) => values.get(key) ?? null),
  setItem: jest.fn((key: string, value: string) => values.set(key, value)),
};

describe("transfer write token storage", () => {
  beforeEach(() => {
    values.clear();
    clearActiveTransferWriteTokensForTests();
    storage.getItem.mockClear();
    storage.setItem.mockClear();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: storage },
    });
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { randomUUID: jest.fn(() => "generated-token") },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
    Reflect.deleteProperty(globalThis, "crypto");
  });

  it("keeps the active capability when persistent storage disappears", () => {
    expect(getOrCreateTransferWriteToken("transfer-a")).toBe(
      "generated-token"
    );

    values.clear();

    expect(getTransferWriteToken("transfer-a")).toBe("generated-token");
    expect(getOrCreateTransferWriteToken("transfer-a")).toBe(
      "generated-token"
    );
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it("keeps simultaneous transfer capabilities isolated by transfer ID", () => {
    const randomUUID = crypto.randomUUID as jest.MockedFunction<
      typeof crypto.randomUUID
    >;
    randomUUID
      .mockReturnValueOnce("token-a")
      .mockReturnValueOnce("token-b")
      .mockReturnValueOnce("token-c");

    expect(getOrCreateTransferWriteToken("transfer-a")).toBe("token-a");
    expect(getOrCreateTransferWriteToken("transfer-b")).toBe("token-b");
    expect(getOrCreateTransferWriteToken("transfer-c")).toBe("token-c");
    expect(getTransferWriteToken("transfer-a")).toBe("token-a");
    expect(getTransferWriteToken("transfer-b")).toBe("token-b");
    expect(getTransferWriteToken("transfer-c")).toBe("token-c");
  });

  it("continues with the active copy when persistent storage rejects writes", () => {
    storage.setItem.mockImplementationOnce(() => {
      throw new Error("Storage quota exceeded");
    });

    expect(getOrCreateTransferWriteToken("transfer-a")).toBe(
      "generated-token"
    );
    expect(getTransferWriteToken("transfer-a")).toBe("generated-token");
  });
});
