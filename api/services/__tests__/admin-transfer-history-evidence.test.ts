import { describe, expect, it, jest } from "@jest/globals";
import { NextApiResponse } from "next";
import type { Transfer } from "models/transfer";
import { ETH_TO_SYS_TRANSFER_STATUS, SYS_TO_ETH_TRANSFER_STATUS } from "@contexts/Transfer/types";
import { historyEvidenceMatchesLogs, saveTransferSourceLogs } from "../admin-transfer/history-evidence";

const utxoHash = "a".repeat(64);
const nevmHash = `0x${utxoHash}`;
const sourceLog = (status: Transfer["status"], data: unknown) => ({
  status, date: 1, payload: { data, message: "Transfer progress" },
});

describe("administrator edits to verified history sources", () => {
  it("requires both freeze references, including for a legacy string submission", () => {
    const submission = sourceLog(ETH_TO_SYS_TRANSFER_STATUS.FREEZE_BURN_SYS, nevmHash);
    const receipt = sourceLog(ETH_TO_SYS_TRANSFER_STATUS.CONFIRM_FREEZE_BURN_SYS, { transactionHash: nevmHash });
    expect(historyEvidenceMatchesLogs("nevm-to-sys", [submission, receipt], nevmHash)).toBe(true);
    expect(historyEvidenceMatchesLogs("nevm-to-sys", [submission], nevmHash)).toBe(false);
  });

  it("does not treat a UTXO confirmation as a replacement for its submission", () => {
    const confirmation = sourceLog(SYS_TO_ETH_TRANSFER_STATUS.BURN_SYSX, { txid: utxoHash });
    expect(historyEvidenceMatchesLogs("sys-to-nevm", [confirmation], utxoHash)).toBe(false);
  });

  it("unsets evidence in the versioned save when an administrator appends a conflicting source", async () => {
    const set = jest.fn();
    const increment = jest.fn();
    const save = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const transfer = {
      type: "sys-to-nevm", __v: 7, set, increment, save,
      historyEvidence: { sourceTransactionHash: utxoHash },
      logs: [
        sourceLog(SYS_TO_ETH_TRANSFER_STATUS.BURN_SYSX, { tx: utxoHash }),
        sourceLog(SYS_TO_ETH_TRANSFER_STATUS.BURN_SYSX, { tx: "b".repeat(64) }),
      ],
    } as unknown as Transfer;
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    await saveTransferSourceLogs(transfer, { status } as unknown as NextApiResponse);
    expect(set).toHaveBeenCalledWith("historyEvidence", undefined);
    expect(increment).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenCalledWith(200);
  });
});
