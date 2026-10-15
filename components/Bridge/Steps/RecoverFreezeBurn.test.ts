import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
let hash = "", mutation: any, options: any;
const recover = jest.fn<any>(), mutate = jest.fn<any>(), cache = jest.fn<any>();
const compiled = ts.transpileModule(readFileSync(join(__dirname, "RecoverFreezeBurn.tsx"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const componentExports: any = {};
new Function("require", "exports", compiled)((name: string) => {
  if (name === "react") return { ...React, useState: () => [hash, jest.fn()] };
  if (name === "react-query") return {
    useQueryClient: () => ({ setQueryData: cache }),
    useMutation: (key: unknown, fn: any, opts: any) => {
      expect(key).toEqual(["recover-freeze-burn", "transfer-1"]);
      mutation = fn; options = opts; return { mutate, isLoading: false };
    },
  };
  if (name === "../recover-freeze-burn") return { recoverExistingFreezeBurn: recover };
  if (name === "@mui/material") return {
    Box: ({ children }: any) => React.createElement("section", null, children),
    Typography: ({ children }: any) => React.createElement("p", null, children),
    TextField: ({ label, fullWidth: _fullWidth, ...props }: any) => React.createElement("input", { "aria-label": label, ...props }),
    Button: ({ children, ...props }: any) => React.createElement("button", props, children),
    Alert: ({ children }: any) => React.createElement("div", null, children),
  };
  return require(name);
}, componentExports);
beforeEach(() => { jest.clearAllMocks(); hash = ""; });
describe("user existing-hash recovery control", () => {
  it("shows an explicitly non-signing path and disables invalid hashes", () => {
    const element = componentExports.default({ transferId: "transfer-1" });
    expect(renderToStaticMarkup(element)).toContain("does not sign or send another transaction");
    expect(element.props.children[2].props.disabled).toBe(true);
    expect(recover).not.toHaveBeenCalled();
  });
  it("submits only recovery and caches the returned transfer identity", async () => {
    hash = ` 0x${"a".repeat(64)} `;
    const element = componentExports.default({ transferId: "transfer-1" });
    expect(element.props.children[2].props.disabled).toBe(false);
    element.props.children[2].props.onClick(); expect(mutate).toHaveBeenCalledTimes(1);
    await mutation(); expect(recover).toHaveBeenCalledWith("transfer-1", hash.trim());
    const result = { id: "transfer-1", status: "mint-sysx" }; options.onSuccess(result);
    expect(cache).toHaveBeenCalledWith(["transfer", "transfer-1"], result);
  });
});

describe("freeze controls while recovery is pending", () => {
  const freeze = jest.fn<any>();
  let count = 0, signError = false;
  const code = ts.transpileModule(readFileSync(join(__dirname, "FreezeAndBurnSys.tsx"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const freezeExports: any = {};
  new Function("require", "exports", code + "\nexports.TestFreeze = FreezeAndBurn;")((name: string) => {
    if (name === "react-query") return { useIsMutating: () => count, useQueryClient: () => ({ isMutating: () => count }) };
    if (name === "../context/TransferContext") return { useTransfer: () => ({ transfer: { id: "transfer-1", logs: [] }, saveTransfer: jest.fn() }) };
    if (name === "../hooks/useFreezeAndBurn") return { useFreezeAndBurn: () => ({ mutate: freeze, isError: signError, isLoading: false, error: "RPC disconnected" }) };
    if (name === "../NEVMStepWrapepr" || name === "./RecoverFreezeBurn") return { __esModule: true, default: () => null };
    return require(name);
  }, freezeExports);
  beforeEach(() => { count = 0; signError = false; freeze.mockClear(); });
  it.each([false, true])("disables %s error-state signing and rechecks pending state before any signature", (error) => {
    signError = error; count = 1;
    const element = freezeExports.TestFreeze({ successStatus: "confirm-freeze-burn-sys" });
    const button = error ? element.props.children[0].props.action : element.props.children[2];
    expect(button.props.disabled).toBe(true); button.props.onClick();
    expect(freeze).not.toHaveBeenCalled();
    count = 0;
    const earlier = freezeExports.TestFreeze({ successStatus: "confirm-freeze-burn-sys" });
    const earlierButton = error ? earlier.props.children[0].props.action : earlier.props.children[2];
    count = 1; earlierButton.props.onClick();
    expect(freeze).not.toHaveBeenCalled();
  });
});

describe("persisted error recovery routing", () => {
  const recover = () => null;
  const steps = new Map<string, () => null>();
  let transfer: any;
  const code = ts.transpileModule(readFileSync(join(__dirname, "../StepSwitch.tsx"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const switchExports: any = {};
  new Function("require", "exports", code)((name: string) => {
    if (name === "./context/TransferContext") return { useTransfer: () => ({ transfer }) };
    if (name === "./Steps/RecoverFreezeBurn") return { __esModule: true, default: recover };
    if (name.startsWith("./Steps/")) {
      if (!steps.has(name)) steps.set(name, () => null);
      return { __esModule: true, default: steps.get(name) };
    }
    return require(name);
  }, switchExports);
  it("offers only recovery, not new signing, for a persisted NEVM error", () => {
    transfer = { type: "nevm-to-sys", status: "error", id: "transfer-1", logs: [] };
    const element = switchExports.default({});
    expect(element.type).toBe(recover); expect(element.props.transferId).toBe("transfer-1");
    transfer = { ...transfer, type: "sys-to-nevm" };
    expect(switchExports.default({})).toBeNull();
  });
  it("keeps a freeze submission error recovery-only instead of re-signing", () => {
    transfer = { type: "nevm-to-sys", status: "error", id: "transfer-1", logs: [
      { status: "freeze-burn-sys", payload: { data: { hash: `0x${"a".repeat(64)}` } } },
    ] };
    expect(switchExports.default({}).type).toBe(recover);
  });
  it.each([
    ["confirm-freeze-burn-sys", { transactionHash: `0x${"a".repeat(64)}` }, "./Steps/MintSysx", undefined],
    ["mint-sysx", { tx: "b".repeat(64) }, "./Steps/ConfirmUTXOTransaction", "mint-sysx"],
    ["mint-sysx", { txid: "b".repeat(64) }, "./Steps/BurnSysx", undefined],
    ["burn-sysx", { tx: "c".repeat(64) }, "./Steps/ConfirmUTXOTransaction", "burn-sysx"],
    ["burn-sysx", { txid: "c".repeat(64) }, "./Steps/ConfirmUTXOTransaction", "burn-sysx"],
  ])("continues later %s error at the recorded checkpoint", (status, data, component, sourceStatus) => {
    transfer = { type: "nevm-to-sys", status: "error", id: "transfer-1", logs: [
      { status, payload: { data } },
    ] };
    const element = switchExports.default({});
    expect(element.type).toBe(steps.get(component as string));
    expect(element.props.sourceStatus).toBe(sourceStatus);
    expect(element.type).not.toBe(recover);
  });
});
