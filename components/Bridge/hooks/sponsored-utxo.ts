import { UTXOTransaction } from "syscoinjs-lib";
import { buildApiUrl } from "utils/api-base-url";
import { getTransferWriteToken } from "utils/transfer-write-token";

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
  const writeToken = getTransferWriteToken(transferId);
  const response = await fetch(
    buildApiUrl(
      `/api/transfer/${encodeURIComponent(transferId)}/sponsored-utxo`
    ),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(writeToken ? { Authorization: `Bearer ${writeToken}` } : {}),
      },
      body: JSON.stringify({ action, transaction }),
    }
  );
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.message ?? "UTXO sponsorship request failed");
  }
  return body as SponsoredUtxoResponse;
};
