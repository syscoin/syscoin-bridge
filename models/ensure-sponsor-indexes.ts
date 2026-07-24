import SponsorRateLimit from "./sponsor-rate-limit";
import SponsorUtxoReservation from "./sponsor-utxo-reservation";
import SponsorWalletTransactions from "./sponsor-wallet-transactions";

/** Drop prior {action, sourceTxHash} index defs so V2 options can be installed. */
const dropConflictingSourceTxHashIndexes = async () => {
  const collection = SponsorWalletTransactions.collection;
  let indexes: Array<{ name?: string; key?: Record<string, number> }> = [];
  try {
    indexes = await collection.indexes();
  } catch {
    // Collection may not exist yet on first boot.
    return;
  }

  for (const idx of indexes) {
    if (!idx.name || idx.name === "_id_") {
      continue;
    }
    if (idx.key?.action === 1 && idx.key?.sourceTxHash === 1) {
      if (idx.name === "action_1_sourceTxHash_1_v2") {
        continue;
      }
      await collection.dropIndex(idx.name);
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
