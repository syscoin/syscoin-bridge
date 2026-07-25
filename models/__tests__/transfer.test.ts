import { describe, expect, it } from "@jest/globals";
import TransferModel from "../transfer";

describe("Transfer model administrative compatibility", () => {
  it("allows an administrator to save an existing V1 row without a public write token", () => {
    const transfer = new TransferModel({
      id: "legacy-transfer",
      type: "nevm-to-sys",
      status: "completed",
      logs: [],
      createdAt: 1,
      version: "v1",
    });

    expect(transfer.validateSync()).toBeUndefined();
  });
});
