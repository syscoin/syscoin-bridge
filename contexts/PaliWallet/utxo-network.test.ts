import { describe, expect, it, jest } from "@jest/globals";
import {
  clearUtxoSelectionBeforeAccountChange,
  connectPaliUtxoAccount,
  discoverPaliUtxoAccount,
  getPaliSyscoinSwitchRequest,
  hasPaliUtxoAccountDetails,
  readPaliBitcoinBasedState,
  switchToSyscoinThenChangeAccount,
} from "./utxo-network";

describe("Pali Syscoin UTXO network handling", () => {
  it("clears the bridge selection before opening the account picker", async () => {
    const calls: string[] = [];
    const setUtxo = jest.fn(() => calls.push("clear"));
    const changeAccount = jest.fn(async () => {
      calls.push("change-account");
    });

    await clearUtxoSelectionBeforeAccountChange(setUtxo, changeAccount);

    expect(setUtxo).toHaveBeenCalledWith({ address: "", xpub: "" });
    expect(calls).toEqual(["clear", "change-account"]);
  });

  it("discovers an existing account without opening an interactive request", async () => {
    const request = jest.fn(async () => ({ address: "sys1-existing" }));

    await expect(discoverPaliUtxoAccount({ request })).resolves.toBe(
      "sys1-existing"
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({ method: "wallet_getAccount" });
  });

  it("stays disconnected when silent discovery fails", async () => {
    const request = jest.fn(async () => {
      throw new Error("Not connected");
    });

    await expect(discoverPaliUtxoAccount({ request })).resolves.toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalledWith({ method: "sys_requestAccounts" });
  });

  it("requires both an address and xpub before showing account controls", () => {
    expect(hasPaliUtxoAccountDetails(undefined, undefined)).toBe(false);
    expect(hasPaliUtxoAccountDetails("sys1-address", undefined)).toBe(false);
    expect(hasPaliUtxoAccountDetails(undefined, "xpub-value")).toBe(false);
    expect(hasPaliUtxoAccountDetails("sys1-address", "xpub-value")).toBe(
      true
    );
  });

  it("switches an account discovered on the opposite Syscoin network before connecting", async () => {
    const calls: string[] = [];
    const switchTo = jest.fn(async () => {
      calls.push("switch");
    });
    const connectAccount = jest.fn(async () => {
      calls.push("connect");
    });

    await connectPaliUtxoAccount(
      undefined,
      "xpub-from-opposite-network",
      switchTo,
      connectAccount
    );

    expect(calls).toEqual(["switch", "connect"]);
    expect(switchTo).toHaveBeenCalledWith("bitcoin");
  });

  it("connects directly when no opposite-network account was discovered", async () => {
    const switchTo = jest.fn(async () => undefined);
    const connectAccount = jest.fn(async () => undefined);

    await connectPaliUtxoAccount(
      undefined,
      undefined,
      switchTo,
      connectAccount
    );

    expect(switchTo).not.toHaveBeenCalled();
    expect(connectAccount).toHaveBeenCalledTimes(1);
  });

  it("does not request an account when the configured-chain switch is rejected", async () => {
    const switchError = new Error("Network switch rejected");
    const switchTo = jest.fn(async () => {
      throw switchError;
    });
    const connectAccount = jest.fn(async () => undefined);

    await expect(
      connectPaliUtxoAccount(
        undefined,
        "xpub-from-opposite-network",
        switchTo,
        connectAccount
      )
    ).rejects.toBe(switchError);
    expect(connectAccount).not.toHaveBeenCalled();
  });

  it("uses the UTXO chain-switch method for Syscoin mainnet", () => {
    expect(getPaliSyscoinSwitchRequest(false, true)).toEqual({
      method: "sys_switchChain",
      params: [{ chainId: 57 }],
    });
  });

  it("uses the Syscoin testnet UTXO chain id", () => {
    expect(getPaliSyscoinSwitchRequest(true, true)).toEqual({
      method: "sys_switchChain",
      params: [{ chainId: 5700 }],
    });
  });

  it("switches from the EVM family before selecting a UTXO account", () => {
    expect(getPaliSyscoinSwitchRequest(false, false)).toEqual({
      method: "sys_changeUTXOEVM",
      params: [{ chainId: 57 }],
    });
  });

  it("reads the authoritative background mode instead of stale in-page state", async () => {
    const provider = {
      request: jest.fn(async () => ({ isBitcoinBased: true })),
      isBitcoinBased: jest.fn(() => false),
    };

    await expect(readPaliBitcoinBasedState(provider)).resolves.toBe(true);
    expect(provider.isBitcoinBased).not.toHaveBeenCalled();
  });

  it("falls back to in-page mode for older Pali v2 builds", async () => {
    const provider = {
      request: jest.fn(async () => {
        throw new Error("Unsupported method");
      }),
      isBitcoinBased: jest.fn(() => true),
    };

    await expect(readPaliBitcoinBasedState(provider)).resolves.toBe(true);
  });

  it("ensures Syscoin is active before opening the account picker", async () => {
    const calls: string[] = [];
    const switchTo = jest.fn(async (networkType: "bitcoin" | "ethereum") => {
      calls.push(`switch:${networkType}`);
    });
    const changeAccount = jest.fn(async () => {
      calls.push("change-account");
    });

    await switchToSyscoinThenChangeAccount(true, switchTo, changeAccount);

    expect(calls).toEqual(["switch:bitcoin", "change-account"]);
  });

  it("uses the account selected during an EVM-to-UTXO reconnect", async () => {
    const switchTo = jest.fn(async () => undefined);
    const changeAccount = jest.fn(async () => undefined);

    await switchToSyscoinThenChangeAccount(false, switchTo, changeAccount);

    expect(switchTo).toHaveBeenCalledWith("bitcoin");
    expect(changeAccount).not.toHaveBeenCalled();
  });

  it("does not open the account picker when the network switch is rejected", async () => {
    const switchError = new Error("Network switch rejected");
    const switchTo = jest.fn(async () => {
      throw switchError;
    });
    const changeAccount = jest.fn(async () => undefined);

    await expect(
      switchToSyscoinThenChangeAccount(true, switchTo, changeAccount)
    ).rejects.toBe(switchError);
    expect(changeAccount).not.toHaveBeenCalled();
  });
});
