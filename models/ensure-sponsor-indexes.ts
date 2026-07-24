import SponsorRateLimit from "./sponsor-rate-limit";
import SponsorUtxoReservation from "./sponsor-utxo-reservation";
import SponsorWalletTransactions from "./sponsor-wallet-transactions";

const hasMongoError = (
  error: unknown,
  code: number,
  codeName: string
) => {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const mongoError = error as { code?: number; codeName?: string };
  return mongoError.code === code || mongoError.codeName === codeName;
};

/** Drop prior {action, sourceTxHash} index defs so V2 options can be installed. */
const dropConflictingSourceTxHashIndexes = async () => {
  const collection = SponsorWalletTransactions.collection;
  let indexes: Array<{ name?: string; key?: Record<string, number> }> = [];
  try {
    indexes = await collection.indexes();
  } catch (error) {
    // Collection may not exist yet on first boot.
    if (hasMongoError(error, 26, "NamespaceNotFound")) {
      return;
    }
    throw error;
  }

  for (const idx of indexes) {
    if (!idx.name || idx.name === "_id_") {
      continue;
    }
    if (idx.key?.action === 1 && idx.key?.sourceTxHash === 1) {
      if (idx.name === "action_1_sourceTxHash_1_v2") {
        continue;
      }
      try {
        await collection.dropIndex(idx.name);
      } catch (error) {
        // Another cold start may have removed the same legacy index.
        if (!hasMongoError(error, 27, "IndexNotFound")) {
          throw error;
        }
      }
    }
  }
};

export const ensureSponsorIndexes = async () => {
  await dropConflictingSourceTxHashIndexes();
  await Promise.all([
    SponsorWalletTransactions.createIndexes(),
    SponsorUtxoReservation.createIndexes(),
    SponsorRateLimit.createIndexes(),
  ]);
};
