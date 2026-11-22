import { Buffer } from "buffer";

const post = async (url: string, body: Record<string, unknown>) => {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    method: "POST",
    credentials: "include",
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.message || "Administrator request failed.");
  }
  return result;
};

export const requestAdminWalletAuthorization = async (
  url: string,
  body: Record<string, unknown>,
  signMessage: (message: string) => Promise<string>
) => {
  const prepared = await post(url, body);
  if (typeof prepared?.challenge !== "string" || typeof prepared?.message !== "string") {
    throw new Error("The server did not return an administrator challenge.");
  }
  const hexMessage = `0x${Buffer.from(prepared.message, "utf8").toString("hex")}`;
  const signedMessage = await signMessage(hexMessage);
  return post(url, { ...body, challenge: prepared.challenge, signedMessage });
};
