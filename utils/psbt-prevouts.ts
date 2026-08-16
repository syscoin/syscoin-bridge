import { utils as syscoinUtils } from "syscoinjs-lib";

type RawTransactionResponse =
  | string
  | { hex?: unknown; result?: unknown }
  | null
  | undefined;

type RawTransactionFetcher = (
  txid: string
) => Promise<RawTransactionResponse>;

const MAX_CONCURRENT_PREVOUT_FETCHES = 8;

const getRawTransactionHex = (response: RawTransactionResponse) => {
  if (typeof response === "string") return response;
  if (typeof response?.hex === "string") return response.hex;
  if (typeof response?.result === "string") return response.result;
  if (
    response?.result &&
    typeof response.result === "object" &&
    "hex" in response.result &&
    typeof response.result.hex === "string"
  ) {
    return response.result.hex;
  }
  return null;
};

export const fetchBridgeRawTransaction: RawTransactionFetcher = async (
  txid
) => {
  const response = await fetch(
    `/api/utxo/tx/${encodeURIComponent(txid)}`,
    { headers: { Accept: "application/json" } }
  );
  if (!response.ok) {
    throw new Error(`Unable to fetch PSBT prevout (${response.status})`);
  }
  return response.json();
};

/**
 * Make dapp-created PSBTs self-contained for wallets that authenticate every
 * selected prevout. The parent is txid-bound before it is attached, so the
 * bridge proxy is only a transport and cannot change what the wallet signs.
 */
export const attachPsbtPrevouts = async (
  psbt: any,
  fetchRawTransaction: RawTransactionFetcher = fetchBridgeRawTransaction
) => {
  if (
    !Array.isArray(psbt?.txInputs) ||
    !Array.isArray(psbt?.data?.inputs) ||
    psbt.txInputs.length !== psbt.data.inputs.length
  ) {
    throw new Error("Unable to prepare PSBT prevouts");
  }

  const inputIndexesByTxid = new Map<string, number[]>();
  psbt.txInputs.forEach((txInput: any, inputIndex: number) => {
    if (psbt.data.inputs[inputIndex]?.nonWitnessUtxo) return;

    const txid = Buffer.from(txInput.hash).reverse().toString("hex");
    const inputIndexes = inputIndexesByTxid.get(txid);
    if (inputIndexes) inputIndexes.push(inputIndex);
    else inputIndexesByTxid.set(txid, [inputIndex]);
  });

  const pendingPrevouts = Array.from(inputIndexesByTxid.entries());
  let nextPrevoutIndex = 0;
  const attachNextPrevout = async () => {
    while (true) {
      const pendingPrevout = pendingPrevouts[nextPrevoutIndex++];
      if (!pendingPrevout) return;
      const [txid, inputIndexes] = pendingPrevout;
      const response = await fetchRawTransaction(txid);
      const rawTransactionHex = getRawTransactionHex(response);
      if (
        !rawTransactionHex ||
        rawTransactionHex.length % 2 !== 0 ||
        !/^[0-9a-fA-F]+$/.test(rawTransactionHex)
      ) {
        throw new Error(`Unable to fetch PSBT prevout ${txid}`);
      }

      const rawTransaction = Buffer.from(rawTransactionHex, "hex");
      const previousTransaction =
        syscoinUtils.bitcoinjs.Transaction.fromBuffer(rawTransaction);
      const nonWitnessTransaction = previousTransaction.clone();
      nonWitnessTransaction.ins.forEach((input: any) => {
        input.witness = [];
      });
      const nonWitnessUtxo = nonWitnessTransaction.toBuffer();

      for (const inputIndex of inputIndexes) {
        if (
          !Buffer.from(psbt.txInputs[inputIndex].hash).equals(
            previousTransaction.getHash()
          )
        ) {
          throw new Error(`PSBT prevout ${txid} does not match its txid`);
        }
        psbt.updateInput(inputIndex, { nonWitnessUtxo });
      }
    }
  };

  await Promise.all(
    Array.from(
      {
        length: Math.min(
          MAX_CONCURRENT_PREVOUT_FETCHES,
          pendingPrevouts.length
        ),
      },
      attachNextPrevout
    )
  );

  return psbt;
};

export const exportPsbtWithPrevouts = async (
  psbt: any,
  assets: any,
  fetchRawTransaction?: RawTransactionFetcher
) => {
  await attachPsbtPrevouts(psbt, fetchRawTransaction);
  return syscoinUtils.exportPsbtToJson(psbt, assets);
};
