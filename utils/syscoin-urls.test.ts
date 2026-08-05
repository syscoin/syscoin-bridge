import { describe, expect, it } from "@jest/globals";
import {
  firstConfiguredUtxoBlockbookUrl,
  MAINNET_BLOCKBOOK_URL,
  resolveUtxoBlockbookUrl,
} from "./syscoin-urls";

describe("resolveUtxoBlockbookUrl", () => {
  it("preserves missing configuration", () => {
    expect(resolveUtxoBlockbookUrl()).toBeUndefined();
  });

  it("maps the legacy mainnet Blockbook host to the explorer host", () => {
    expect(resolveUtxoBlockbookUrl("https://blockbook.syscoin.org")).toBe(
      MAINNET_BLOCKBOOK_URL
    );
  });

  it("preserves custom Blockbook URLs", () => {
    expect(resolveUtxoBlockbookUrl("https://custom-blockbook.example")).toBe(
      "https://custom-blockbook.example"
    );
  });

  it("uses the first configured Blockbook URL", () => {
    expect(
      firstConfiguredUtxoBlockbookUrl(
        undefined,
        "https://testnet-blockbook.example",
        "https://fallback.example"
      )
    ).toBe("https://testnet-blockbook.example");
  });

  it("normalizes the selected legacy Blockbook URL", () => {
    expect(
      firstConfiguredUtxoBlockbookUrl(
        undefined,
        "https://blockbook.syscoin.org"
      )
    ).toBe(MAINNET_BLOCKBOOK_URL);
  });
});
