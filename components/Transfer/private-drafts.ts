import type { ITransfer } from "@contexts/Transfer/types";
import { readTransferDetail, TransferReadError } from "utils/transfer-detail";
import { getTransferWriteToken } from "utils/transfer-write-token";

export const DRAFTS_PER_PAGE = 16;
const REQUESTS_PER_BATCH = 4;

export const readPrivateDrafts = async (
  ids: string[],
  signal?: AbortSignal
): Promise<{ drafts: ITransfer[]; hasError: boolean }> => {
  const drafts: ITransfer[] = [];
  let hasError = false;
  const page = ids.slice(0, DRAFTS_PER_PAGE);
  for (let offset = 0; offset < page.length; offset += REQUESTS_PER_BATCH) {
    if (signal?.aborted) break;
    await Promise.all(page.slice(offset, offset + REQUESTS_PER_BATCH).map(async (id) => {
      const token = getTransferWriteToken(id);
      if (!token) return;

      try {
        const transfer = await readTransferDetail(id, token, signal);
        if (transfer.historyPublic === false) drafts.push(transfer);
      } catch (error) {
        if (error instanceof TransferReadError && error.status === 404) return;
        hasError = true;
      }
    }));
  }
  drafts.sort((a, b) => b.createdAt - a.createdAt);
  return { drafts, hasError };
};
