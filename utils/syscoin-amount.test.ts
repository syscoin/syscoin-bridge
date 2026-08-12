import { describe, expect, it } from "@jest/globals";

import {
  formatSyscoinBaseUnits,
  getTransferableSyscoinBaseUnits,
  toSyscoinBaseUnits,
} from "./syscoin-amount";

describe("Syscoin amount conversion", () => {
  it("converts eight-decimal amounts without Number precision loss", () => {
    expect(toSyscoinBaseUnits("67108864.00000038")).toBe(
      "6710886400000038"
    );
    expect(toSyscoinBaseUnits("90071992.54740991")).toBe(
      "9007199254740991"
    );
  });

  it("pads whole and fractional SYS values to base units", () => {
    expect(toSyscoinBaseUnits("1")).toBe("100000000");
    expect(toSyscoinBaseUnits("0.00000001")).toBe("1");
    expect(toSyscoinBaseUnits("1.23")).toBe("123000000");
  });

  it("derives transferable maxima from exact source-chain units", () => {
    const reserveBaseUnits = toSyscoinBaseUnits("0.001");

    expect(
      getTransferableSyscoinBaseUnits({
        balanceBaseUnits: "1000000000000001",
        balanceDecimals: 18,
        reserveBaseUnits,
      })
    ).toBe("0");
    expect(
      getTransferableSyscoinBaseUnits({
        balanceBaseUnits: "11000006000000000",
        balanceDecimals: 18,
        reserveBaseUnits,
      })
    ).toBe("1000000");
    expect(
      getTransferableSyscoinBaseUnits({
        balanceBaseUnits: "11000150000000000",
        balanceDecimals: 18,
        reserveBaseUnits,
      })
    ).toBe("1000015");
    expect(
      getTransferableSyscoinBaseUnits({
        balanceBaseUnits: "1000015",
        balanceDecimals: 8,
        reserveBaseUnits: "0",
      })
    ).toBe("1000015");
    expect(
      getTransferableSyscoinBaseUnits({
        balanceBaseUnits: "90071992547409910000000000",
        balanceDecimals: 18,
        reserveBaseUnits: "0",
      })
    ).toBe("9007199254740991");
  });

  it("formats exact Syscoin base units for validation messages", () => {
    expect(formatSyscoinBaseUnits("0")).toBe("0");
    expect(formatSyscoinBaseUnits("1")).toBe("0.00000001");
    expect(formatSyscoinBaseUnits("1000015")).toBe("0.01000015");
    expect(formatSyscoinBaseUnits("100000000")).toBe("1");
  });

  it("rejects malformed, nonpositive, and over-precision values", () => {
    for (const amount of [
      "",
      "0",
      "-1",
      "1e2",
      "1.000000001",
      "1".repeat(21),
    ]) {
      expect(() => toSyscoinBaseUnits(amount)).toThrow();
    }
  });
});
