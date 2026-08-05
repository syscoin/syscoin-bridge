import { describe, expect, it, jest } from "@jest/globals";
import {
  getPaliSyscoinSwitchRequest,
  readPaliBitcoinBasedState,
  switchToSyscoinThenChangeAccount,
} from "./utxo-network";

describe("Pali Syscoin UTXO network handling", () => {
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
