import SponsorRateLimit from "./sponsor-rate-limit";
import SponsorUtxoReservation from "./sponsor-utxo-reservation";
import SponsorWalletTransactions from "./sponsor-wallet-transactions";

export const ensureSponsorIndexes = async () => {
  await Promise.all([
    SponsorWalletTransactions.createIndexes(),
    SponsorUtxoReservation.createIndexes(),
    SponsorRateLimit.createIndexes(),
  ]);
};
