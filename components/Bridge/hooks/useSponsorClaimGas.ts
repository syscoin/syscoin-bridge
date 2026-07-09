import { ITransfer } from "@contexts/Transfer/types";
import { useMutation } from "react-query";

export type SponsorClaimGasResponse = {
  funded: boolean;
  status: "skipped" | "pending" | "success" | "failed";
  txid?: string;
  amountSats?: number;
  balanceSats?: number;
  reason?: string;
};

export const useSponsorClaimGas = (transfer: ITransfer) => {
  return useMutation(["sponsor-claim-gas", transfer.id], async () => {
    const response = await fetch(
      `/api/transfer/${encodeURIComponent(transfer.id)}/sponsor-claim-gas`,
      {
        method: "POST",
      }
    );

    const body = await response.json();

    if (!response.ok) {
      throw new Error(body.message ?? "Unable to sponsor claim gas");
    }

    return body as SponsorClaimGasResponse;
  });
};
