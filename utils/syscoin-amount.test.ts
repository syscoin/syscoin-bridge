import { describe, expect, it } from "@jest/globals";

import { toSyscoinBaseUnits } from "./syscoin-amount";

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
