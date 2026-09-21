import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const mockSave = jest.fn<any>();
const mockSetRetrying = jest.fn<any>();
let retrying = false;
let mutation: Record<string, unknown>;
const persisted = { id: "transfer-1", status: "finalizing", logs: [] };
const pending = { ...persisted, status: "completed", logs: [{ transactionHash: "confirmed" }] };

// Project Jest preserves JSX for Next. Compile only this component for the
// server-rendered harness without changing the application/test configuration.
const source = readFileSync(join(__dirname, "TransferContext.tsx"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const componentExports: Record<string, any> = {};
const testRequire = (name: string): unknown => {
  if (name === "react") return { ...React, useState: () => [retrying, mockSetRetrying] };
  if (name === "react-query") return {
    useQuery: () => ({ data: persisted, refetch: jest.fn() }),
    useMutation: () => ({ mutate: mockSave, ...mutation }),
  };
  if (name === "@mui/material") return {
    Alert: ({ children, action }: any) => React.createElement("section", { role: "alert" }, children, action),
    Button: ({ children, disabled }: any) => React.createElement("button", { disabled }, children),
  };
  return require(name);
};
new Function("require", "exports", compiled)(testRequire, componentExports);

const renderProvider = () => componentExports.TransferContextProvider({
  transfer: persisted,
  children: React.createElement("div", null, "Transaction step"),
}) as React.ReactElement;

describe("transfer save recovery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    retrying = false;
    mutation = { isLoading: false, isError: false, variables: undefined };
  });

  it("renders the existing persisted step normally", () => {
    const element = renderProvider();
    expect(element.props.value.transfer).toBe(persisted);
    expect(renderToStaticMarkup(element)).toContain("Transaction step");
  });

  it("shows failed completion saves without advancing or rerunning the transaction step", () => {
    mutation = { isError: true, error: new Error("Unable to verify transfer completion"), variables: pending };
    const element = renderProvider();
    const html = renderToStaticMarkup(element);
    expect(html).toContain("Unable to verify transfer completion");
    expect(html).toContain("Retry");
    expect(html).not.toContain("Transaction step");
    expect(element.props.value.transfer).toBe(persisted);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("leaves non-completion saves with their existing step-specific behavior", () => {
    mutation = { isError: true, error: new Error("Save failed"), variables: { ...pending, status: "burn-sys" } };
    const html = renderToStaticMarkup(renderProvider());
    expect(html).toContain("Transaction step");
    expect(html).not.toContain("Retry");
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("retries only the exact failed save, without adding logs or signing a new transaction", () => {
    mutation = { isError: true, error: new Error("Temporary verification failure"), variables: pending };
    const retryButton = renderProvider().props.children.props.action;
    retryButton.props.onClick();
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave.mock.calls[0][0]).toBe(pending);
    expect(mockSave.mock.calls[0][0].logs).toBe(pending.logs);
    expect(mockSetRetrying).toHaveBeenCalledWith(true);
    mockSave.mock.calls[0][1].onSettled();
    expect(mockSetRetrying).toHaveBeenLastCalledWith(false);
  });

  it("keeps transaction controls hidden and retry disabled while resaving", () => {
    retrying = true;
    mutation = { isError: false, isLoading: true, variables: pending };
    const element = renderProvider();
    const html = renderToStaticMarkup(element);
    expect(html).toContain("Saving transfer...");
    expect(html).not.toContain("Transaction step");
    expect(element.props.children.props.action.props.disabled).toBe(true);
    expect(element.props.value.transfer).toBe(persisted);
  });
});
