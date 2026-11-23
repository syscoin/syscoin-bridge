import type { ITransfer } from "@contexts/Transfer/types";
import { Buffer } from "buffer";
import { normalizeEvmChainId } from "utils/network-config";

export type TransferCreationAuthorization = {
  challenge: string;
  signedMessage: string;
};

type EvmWallet = {
  request: (request: { method: string; params?: string[] }) => Promise<unknown>;
};

type CreationOptions = {
  transfer: ITransfer;
  url: string;
  writeToken: string;
  expectedChainId?: string;
  getWallet: () => EvmWallet | undefined;
  switchToNevm?: () => Promise<void>;
};

const walletRequestRejected = (error: unknown) =>
  typeof error === "object" && error !== null &&
  "code" in error && Number(error.code) === 4001;

export const requestTransferCreationAuthorization = async ({
  transfer,
  url,
  writeToken,
  expectedChainId,
  getWallet,
  switchToNevm,
}: CreationOptions): Promise<TransferCreationAuthorization> => {
  const signer = transfer.nevmAddress;
  const expectedChain = normalizeEvmChainId(expectedChainId);
  if (!signer || !/^0x[0-9a-f]{40}$/i.test(signer) || !expectedChain) {
    throw new Error("Select an NEVM account on the bridge network first.");
  }

  if (switchToNevm) {
    try {
      await switchToNevm();
    } catch {
      throw new Error("Switch your wallet to Syscoin NEVM, then try again.");
    }
  }

  const wallet = getWallet();
  if (!wallet) {
    throw new Error("Connect the selected NEVM wallet, then try again.");
  }

  const response = await fetch(`${url}/creation-intent`, {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    redirect: "error",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${writeToken}`,
    },
    body: JSON.stringify(transfer),
  });
  const prepared = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      typeof prepared?.message === "string"
        ? prepared.message
        : "Unable to prepare transfer authorization. Please try again."
    );
  }
  if (
    typeof prepared?.challenge !== "string" || !prepared.challenge ||
    typeof prepared?.message !== "string" ||
    !prepared.message.startsWith("Syscoin Bridge transfer creation\n")
  ) {
    throw new Error("The bridge returned an invalid transfer authorization.");
  }

  // The account and network can change while the challenge is requested.
  // Read them from the active provider rather than cached React state.
  if (normalizeEvmChainId(await wallet.request({ method: "eth_chainId" })) !== expectedChain) {
    throw new Error("Switch the selected wallet to the bridge NEVM network, then try again.");
  }
  const accounts = await wallet.request({ method: "eth_accounts" });
  if (
    !Array.isArray(accounts) || typeof accounts[0] !== "string" ||
    accounts[0].toLowerCase() !== signer.toLowerCase()
  ) {
    throw new Error("Select the NEVM account shown in the transfer, then try again.");
  }

  const message = `0x${Buffer.from(prepared.message, "utf8").toString("hex")}`;
  let signedMessage: unknown;
  try {
    signedMessage = await wallet.request({
      method: "personal_sign",
      params: [message, signer],
    });
  } catch (error) {
    if (walletRequestRejected(error)) {
      throw new Error("Transfer approval was cancelled. You can try again.");
    }
    throw error;
  }
  if (typeof signedMessage !== "string" || !signedMessage) {
    throw new Error("The wallet did not return a transfer signature.");
  }
  return { challenge: prepared.challenge, signedMessage };
};
