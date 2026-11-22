import mongoose, { type FilterQuery, Types } from "mongoose";
import type { Transfer } from "models/transfer";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const USAGE = `Usage: backfill-transfer-history.ts [--limit 1-${MAX_LIMIT}] [--after MONGO_ID] [--apply]

Verify a batch of historical source transactions. Writes are disabled unless --apply is set.`;

type BackfillOptions = {
  limit: number;
  after?: Types.ObjectId;
  apply: boolean;
};

const parseOptions = (args: string[]): BackfillOptions => {
  const options: BackfillOptions = { limit: DEFAULT_LIMIT, apply: false };
  for (let index = 0; index < args.length; index++) {
    switch (args[index]) {
      case "--apply":
        options.apply = true;
        break;
      case "--limit": {
        const value = args[++index];
        const limit = Number(value);
        if (!value || /[^0-9]/.test(value) || limit < 1 || limit > MAX_LIMIT) {
          throw new Error("Invalid limit");
        }
        options.limit = limit;
        break;
      }
      case "--after": {
        const value = args[++index];
        if (!value || !/^[0-9a-f]{24}$/i.test(value) || value.length !== 24) {
          throw new Error("Invalid Mongo cursor");
        }
        options.after = new Types.ObjectId(value);
        break;
      }
      default:
        throw new Error("Unknown argument");
    }
  }
  return options;
};

const withoutEvidence = { historyEvidence: { $exists: false } };

const candidates = (after?: Types.ObjectId): FilterQuery<Transfer> => ({
  ...withoutEvidence,
  ...(after ? { _id: { $gt: after } } : {}),
  $or: [
    {
      type: "sys-to-nevm",
      logs: { $elemMatch: {
        status: "burn-sysx",
        $or: [
          { "payload.data.tx": { $type: "string" } },
          { "payload.data.txid": { $type: "string" } },
        ],
      } },
    },
    {
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
    },
  ],
});

export const backfillTransferHistory = async ({ after, limit, apply }: BackfillOptions) => {
  const { default: TransferModel } = require("models/transfer") as typeof import("models/transfer");
  const { verifyTransferHistoryEvidence } = require("api/services/transfer-progress") as typeof import("api/services/transfer-progress");
  const rows = await TransferModel.find(candidates(after))
    .sort({ _id: 1 })
    .limit(limit)
    .maxTimeMS(15_000)
    .lean();
  const summary = {
    dryRun: !apply,
    candidates: rows.length,
    verified: 0,
    updated: 0,
    skipped: 0,
    retry: 0,
    nextAfter: rows.length === limit ? String(rows[rows.length - 1]._id) : null,
  };

  for (const row of rows) {
    try {
      const evidence = await verifyTransferHistoryEvidence(row);
      if (!evidence) {
        summary.skipped++;
        continue;
      }
      summary.verified++;
      if (!apply) continue;

      const result = await TransferModel.updateOne(
        {
          ...withoutEvidence,
          _id: row._id,
          id: row.id,
          __v: row.__v === undefined ? { $exists: false } : row.__v,
        },
        { $set: { historyEvidence: evidence }, $inc: { __v: 1 } },
        { runValidators: true }
      );
      if (result.modifiedCount === 1) summary.updated++;
      else summary.retry++;
    } catch {
      // The verifier can report an RPC error or proof rejection. Leave the row private.
      summary.retry++;
    }
  }
  return summary;
};

const isHttpUrl = (value?: string): boolean => {
  if (!value) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
};

const main = async (args: string[]) => {
  if (args.includes("--help")) {
    console.log(USAGE);
    return;
  }

  let options: BackfillOptions;
  try {
    options = parseOptions(args);
  } catch {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  if (
    !isHttpUrl(process.env.NEVM_RPC_URL) ||
    !isHttpUrl(process.env.UTXO_RPC_URL || process.env.UTXO_EXPLORER)
  ) {
    console.error("Set the deployment's NEVM_RPC_URL and UTXO_RPC_URL or UTXO_EXPLORER.");
    process.exitCode = 2;
    return;
  }

  try {
    const { resolveMongoUri } = require("utils/mongodb-uri") as typeof import("utils/mongodb-uri");
    await mongoose.connect(resolveMongoUri(), {
      autoCreate: false,
      autoIndex: false,
      bufferCommands: false,
      serverSelectionTimeoutMS: 10_000,
    });
    console.log(JSON.stringify(await backfillTransferHistory(options)));
  } catch {
    console.error("Transfer history backfill failed. Check the deployment configuration and retry the batch.");
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {
      console.error("Unable to close the backfill database connection.");
      process.exitCode = 1;
    });
  }
};

if (require.main === module) {
  void main(process.argv.slice(2));
}
