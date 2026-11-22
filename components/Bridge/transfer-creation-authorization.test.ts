import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type { ITransfer } from "@contexts/Transfer/types";
import { Buffer } from "buffer";
import { requestTransferCreationAuthorization } from "./transfer-creation-authorization";

const selected = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
const transfer = {
  id: "example-transfer",
  nevmAddress: selected,
} as ITransfer;
const url = `/api/transfer/${transfer.id}`;
const prepared = {
  challenge: "challenge",
  message: "Syscoin Bridge transfer creation\nAmount: 1 SYS",
};
const writeToken = "new-capability";

afterEach(() => {
  jest.restoreAllMocks();
});

const mockChallenge = (body: object = prepared) => jest.spyOn(global, "fetch")
  .mockResolvedValue(new Response(JSON.stringify(body)));

const activeWallet = (chainId: unknown, accounts: string[], sign = () => "created-signature") => ({
  request: jest.fn(async ({ method }: { method: string; params?: string[] }) => {
    if (method === "eth_chainId") return chainId;
    if (method === "eth_accounts") return accounts;
    if (method === "personal_sign") return sign();
    throw new Error("Unexpected wallet request");
  }),
});

describe("transfer creation with an NEVM wallet", () => {
  it("switches out of UTXO mode before reading the wallet and signs the selected NEVM address", async () => {
    let ready = false;
    const wallet = activeWallet("0x39", [selected]);
    const getWallet = jest.fn(() => ready ? wallet : undefined);
    const switchToNevm = jest.fn(async () => { ready = true; });
    const request = mockChallenge();

    await expect(requestTransferCreationAuthorization({
      transfer, url, writeToken, expectedChainId: "0x39", getWallet, switchToNevm,
    })).resolves.toEqual({ challenge: "challenge", signedMessage: "created-signature" });

    expect(switchToNevm).toHaveBeenCalledTimes(1);
    expect(getWallet).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(`${url}/creation-intent`, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      headers: { "Content-Type": "application/json", Authorization: "Bearer new-capability" },
      body: JSON.stringify(transfer),
    });
    expect(wallet.request.mock.calls.map(([value]) => value)).toEqual([
      { method: "eth_chainId" },
      { method: "eth_accounts" },
      { method: "personal_sign", params: [`0x${Buffer.from(prepared.message).toString("hex")}`, selected] },
    ]);
  });

  it.each([
    ["changed account", "0x39", [other], "Select the NEVM account"],
    ["changed network", "0x1", [selected], "Switch the selected wallet"],
  ])("does not prompt after a %s", async (_label, chain, accounts, message) => {
    mockChallenge();
    const wallet = activeWallet(chain, accounts);
    await expect(requestTransferCreationAuthorization({
      transfer, url, writeToken, expectedChainId: "0x39", getWallet: () => wallet,
    })).rejects.toThrow(message);
    expect(wallet.request.mock.calls.some(([value]) => value.method === "personal_sign")).toBe(false);
  });

  it("does not sign a response from another authorization scope", async () => {
    mockChallenge({ ...prepared, message: "Syscoin Bridge Admin authorization\nLogin" });
    const wallet = activeWallet("0x39", [selected]);
    await expect(requestTransferCreationAuthorization({
      transfer, url, writeToken, expectedChainId: "0x39", getWallet: () => wallet,
    })).rejects.toThrow("invalid transfer authorization");
    expect(wallet.request).not.toHaveBeenCalled();
  });

  it("reports wallet cancellation without generating a signature", async () => {
    mockChallenge();
    const wallet = activeWallet("0x39", [selected], () => {
      throw { code: 4001 };
    });
    await expect(requestTransferCreationAuthorization({
      transfer, url, writeToken, expectedChainId: "0x39", getWallet: () => wallet,
    })).rejects.toThrow("Transfer approval was cancelled");
    expect(wallet.request.mock.calls.filter(([value]) => value.method === "personal_sign")).toHaveLength(1);
  });
});
