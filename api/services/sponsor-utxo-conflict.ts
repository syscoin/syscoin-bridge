import { utils as syscoinUtils } from "syscoinjs-lib";

const CONFLICT_CONFIRMATIONS = 6;
const MAX_CONFLICT_USER_INPUTS = 24;

type BlockbookTransaction = {
  txid?: string;
  confirmations?: number;
  vin?: { txid?: string; vout?: number }[];
  vout?: { n: number; spent?: boolean; spentTxId?: string }[];
};

export type UtxoBroadcastConflict = {
  spenderTxid: string;
  sponsorOutputSpent: boolean;
};

const getTransaction = async (
  blockbook: string,
  txid: string,
  signal: AbortSignal,
  spending = false
): Promise<BlockbookTransaction | null> => {
  const response = await fetch(
    `${blockbook}/api/v2/tx/${txid}${spending ? "?spending=true" : ""}`,
    { signal }
  );
  if (!response.ok) return null;
  const transaction = (await response.json()) as BlockbookTransaction;
  return transaction?.txid === txid ? transaction : null;
};

export const getConfirmedUtxoBroadcastConflict = async (
  blockbook: string,
  rawTransaction: string,
  expectedTxid: string,
  sponsorKey: string
): Promise<UtxoBroadcastConflict | null> => {
  const expected = syscoinUtils.bitcoinjs.Transaction.fromHex(rawTransaction);
  if (expected.getId() !== expectedTxid) {
    return null;
  }
  const signal = AbortSignal.timeout(5_000);
  const inputs: { txid: string; vout: number }[] = expected.ins.map((input: { hash: Uint8Array; index: number }) => ({
    txid: Buffer.from(input.hash).reverse().toString("hex"),
    vout: input.index,
  }));
  const sponsorInput = inputs.find(({ txid, vout }) => `${txid}:${vout}` === sponsorKey);
  if (!sponsorInput) return null;

  const getPrevout = async ({ txid, vout }: (typeof inputs)[number]) => {
    const previous = await getTransaction(blockbook, txid, signal, true);
    if (!previous || !Array.isArray(previous.vout) || !(previous.confirmations! > 0)) return;
    return previous.vout.find(({ n }) => n === vout);
  };
  const confirmedSpender = async (input: (typeof inputs)[number], spenderTxid?: string) => {
    if (!spenderTxid || spenderTxid === expectedTxid || !/^[a-f0-9]{64}$/.test(spenderTxid)) return;
    const spender = await getTransaction(blockbook, spenderTxid, signal);
    if (
      Number.isSafeInteger(spender?.confirmations) &&
      spender!.confirmations! >= CONFLICT_CONFIRMATIONS &&
      Array.isArray(spender?.vin) &&
      spender.vin.some(({ txid, vout }) => txid === input.txid && (vout ?? 0) === input.vout)
    ) return spenderTxid;
  };

  const sponsorOutput = await getPrevout(sponsorInput);
  if (!sponsorOutput) return null;
  if (sponsorOutput.spent || sponsorOutput.spentTxId) {
    const spenderTxid = await confirmedSpender(sponsorInput, sponsorOutput.spentTxId);
    return spenderTxid ? { spenderTxid, sponsorOutputSpent: true } : null;
  }

  const userInputs = inputs.filter((input) => input !== sponsorInput).slice(0, MAX_CONFLICT_USER_INPUTS);
  for (const input of userInputs) {
    const previous = await getPrevout(input);
    const spenderTxid = await confirmedSpender(input, previous?.spentTxId);
    if (spenderTxid) {
      return { spenderTxid, sponsorOutputSpent: false };
    }
  }
  return null;
};
