import { UTXOTransaction } from "syscoinjs-lib";
import { buildApiUrl } from "utils/api-base-url";

export type SponsoredUtxoResponse =
  | {
      sponsored: true;
      status: "signature-required" | "pending" | "success";
      txid?: string;
      psbt?: UTXOTransaction;
    }
  | { sponsored: false; reason: string };

export const requestSponsoredUtxo = async (
  transferId: string,
  action: "mint" | "prepare-burn" | "submit-burn",
  transaction?: UTXOTransaction
): Promise<SponsoredUtxoResponse> => {
  const response = await fetch(
    buildApiUrl(
      `/api/transfer/${encodeURIComponent(transferId)}/sponsored-utxo`
    ),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, transaction }),
    }
  );
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.message ?? "Unable to sponsor UTXO transaction");
  }
  return body as SponsoredUtxoResponse;
};
