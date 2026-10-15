import isTransfer from "utils/isTransfer";
import { getTransferWriteToken } from "utils/transfer-write-token";

export const recoverExistingFreezeBurn = async (id: string, txHash: string) => {
  if (!/^[a-z0-9_-]+$/i.test(id) || !/^0x[0-9a-f]{64}$/i.test(txHash)) {
    throw new Error("Enter a valid transaction hash");
  }
  const token = getTransferWriteToken(id);
  const response = await fetch(`/api/transfer/${encodeURIComponent(id)}/recover-freeze-burn`, {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ txHash }),
  });
  const value = await response.json();
  if (!response.ok || !isTransfer(value) || value.id !== id) {
    throw new Error(typeof value?.message === "string" ? value.message : "Unable to recover transfer");
  }
  return value;
};
