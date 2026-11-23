import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Types } from "mongoose";
import { backfillTransferHistory } from "./backfill-transfer-history";

const find = jest.fn();
const sort = jest.fn();
const limit = jest.fn();
const maxTimeMS = jest.fn();
const lean = jest.fn();
const updateOne = jest.fn();
const verify = jest.fn();

jest.mock("models/transfer", () => ({
  __esModule: true,
  default: {
    find: (filter: unknown) => {
      find(filter);
      return { sort, limit, maxTimeMS, lean };
    },
    updateOne: (...args: unknown[]) => updateOne(...args),
  },
}));
jest.mock("api/services/transfer-progress", () => ({
  verifyTransferHistoryEvidence: (row: unknown) => verify(row),
}));

const first = { id: "first", _id: new Types.ObjectId(), __v: 3 };
const second = { id: "second", _id: new Types.ObjectId() };
const third = { id: "third", _id: new Types.ObjectId() };
const evidence = {
  sourceTransactionHash: "a".repeat(64),
  nevmAddress: `0x${"b".repeat(40)}`,
  utxoAddresses: ["verified-address"],
};

describe("historical transfer source verification backfill", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    sort.mockReturnValue({ limit });
    limit.mockReturnValue({ maxTimeMS });
    maxTimeMS.mockReturnValue({ lean });
    lean.mockReturnValue([first, second, third]);
  });

  it("checks the bounded batch in dry-run mode without writing", async () => {
    const after = new Types.ObjectId();
    verify.mockReturnValueOnce(evidence).mockReturnValueOnce(undefined)
      .mockImplementationOnce(() => { throw new Error("Chain provider failed"); });

    expect(await backfillTransferHistory({ limit: 3, after, apply: false })).toEqual({
      dryRun: true, candidates: 3, verified: 1, updated: 0, skipped: 1,
      retry: 1, nextAfter: third._id.toString(),
    });
    expect(find).toHaveBeenCalledWith(expect.objectContaining({
      _id: { $gt: after }, historyEvidence: { $exists: false },
      $or: expect.arrayContaining([{
        type: "nevm-to-sys",
        $and: [
          { logs: { $elemMatch: {
            status: "freeze-burn-sys",
            $or: [
              { "payload.data.hash": { $type: "string" } },
              { "payload.data": { $type: "string" } },
            ],
          } } },
          { logs: { $elemMatch: {
            status: "confirm-freeze-burn-sys",
            "payload.data.transactionHash": { $type: "string" },
          } } },
        ],
      }]),
    }));
    expect(sort).toHaveBeenCalledWith({ _id: 1 });
    expect(limit).toHaveBeenCalledWith(3);
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("publishes only verified evidence after a revision check", async () => {
    verify.mockReturnValueOnce(evidence).mockReturnValueOnce(evidence).mockReturnValueOnce(undefined);
    updateOne.mockReturnValueOnce({ modifiedCount: 1 }).mockReturnValueOnce({ modifiedCount: 0 });

    expect(await backfillTransferHistory({ limit: 25, apply: true })).toEqual({
      dryRun: false, candidates: 3, verified: 2, updated: 1, skipped: 1,
      retry: 1, nextAfter: null,
    });
    expect(updateOne).toHaveBeenCalledTimes(2);
    expect(updateOne).toHaveBeenNthCalledWith(1, {
      _id: first._id, id: first.id, __v: 3, historyEvidence: { $exists: false },
    }, { $set: { historyEvidence: evidence }, $inc: { __v: 1 } }, { runValidators: true });
    expect(updateOne).toHaveBeenNthCalledWith(2, {
      _id: second._id, id: second.id, __v: { $exists: false }, historyEvidence: { $exists: false },
    }, { $set: { historyEvidence: evidence }, $inc: { __v: 1 } }, { runValidators: true });
  });
});
