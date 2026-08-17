import { describe, expect, it } from "@jest/globals";
import { stripTrailingSlashes } from "./url";

describe("stripTrailingSlashes", () => {
  it("preserves a URL without a trailing slash", () => {
    expect(stripTrailingSlashes("https://explorer.example")).toBe(
      "https://explorer.example"
    );
  });

  it("removes every trailing slash", () => {
    expect(stripTrailingSlashes("https://explorer.example///")).toBe(
      "https://explorer.example"
    );
  });
});
