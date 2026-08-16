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

const equalBytes = (left: Uint8Array, right: Uint8Array) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const bytesToReversedHex = (bytes: Uint8Array) => {
  let hex = "";
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    hex += bytes[index].toString(16).padStart(2, "0");
  }
  return hex;
};

const hexToBytes = (hex: string) => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
};

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

    if (!(txInput.hash instanceof Uint8Array) || txInput.hash.length !== 32) {
      throw new Error("Unable to prepare PSBT prevouts");
    }

    const txid = bytesToReversedHex(txInput.hash);
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

      // The proxy returns a validated, witness-stripped parent transaction.
      // Keep transaction parsing on the server so this browser path only
      // hashes and attaches authenticated bytes.
      const nonWitnessUtxo = hexToBytes(rawTransactionHex);
      const previousTransactionHash =
        syscoinUtils.bitcoinjs.crypto.hash256(nonWitnessUtxo);

      for (const inputIndex of inputIndexes) {
        if (
          !equalBytes(
            psbt.txInputs[inputIndex].hash,
            previousTransactionHash
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
