import { describe, expect, it } from "@jest/globals";
import TransferModel from "../transfer";
import { ETH_TO_SYS_TRANSFER_STATUS } from "@contexts/Transfer/types";

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

  it("hides the server-owned progress checkpoint from default public queries", () => {
    expect(TransferModel.schema.path("progressStatus").options.select).toBe(false);
  });

  it("versions scalar administrator overrides so a stale public snapshot cannot match", () => {
    const transfer = TransferModel.hydrate({
      id: "transfer-id", version: "v2", status: "error", logs: [],
      progressStatus: "mint-sysx", __v: 3,
    });
    transfer.status = ETH_TO_SYS_TRANSFER_STATUS.BURN_SYSX;
    transfer.set("progressStatus", undefined);
    type Delta = { $__delta(): [Record<string, unknown>, { $inc?: { __v?: number } }] };
    const document = transfer as unknown as Delta;
    expect(document.$__delta()[1].$inc?.__v).toBeUndefined();
    transfer.increment();
    const [predicate, update] = document.$__delta();
    expect(predicate.__v).toBe(3);
    expect(update.$inc?.__v).toBe(1);
  });
});
