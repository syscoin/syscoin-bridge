import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const mockSave = jest.fn<(transfer: { logs: unknown[] }, options: { onSettled: () => void }) => void>();
const mockSetRetrying = jest.fn<any>();
const mockRefetch = jest.fn<any>();
const mockSetQueryData = jest.fn<any>((_key: unknown, transfer: unknown) => {
  cachedTransfer = transfer;
});
let retrying = false;
let mutation: Record<string, unknown>;
let mutationOptions: any;
let cachedTransfer: unknown;
const persisted = { id: "transfer-1", status: "finalizing", logs: [] };
const pending = { ...persisted, status: "completed", logs: [{ transactionHash: "confirmed" }] };
const intermediateStatuses = [
  "confirm-burn-sys",
  "burn-sysx",
  "confirm-burn-sysx",
  "generate-proofs",
  "submit-proofs",
  "confirm-freeze-burn-sys",
  "mint-sysx",
  "confirm-mint-sysx",
  "finalizing",
];

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
    useQuery: () => ({ data: cachedTransfer, refetch: mockRefetch }),
    useQueryClient: () => ({ setQueryData: mockSetQueryData }),
    useMutation: (_key: unknown, _mutationFn: unknown, options: unknown) => {
      mutationOptions = options;
      return { mutate: mockSave, ...mutation };
    },
  };
  if (name === "@mui/material") return {
    Alert: ({ children, action }: any) => React.createElement("section", { role: "alert" }, children, action),
    Button: ({ children, disabled }: any) => React.createElement("button", { disabled }, children),
  };
  return require(name);
};
new Function("require", "exports", compiled)(testRequire, componentExports);

const renderProvider = (initialTransfer = persisted) => componentExports.TransferContextProvider({
  transfer: initialTransfer,
  children: React.createElement("div", null, "Transaction step"),
}) as React.ReactElement<any>;

describe("transfer save recovery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    retrying = false;
    cachedTransfer = persisted;
    mockRefetch.mockResolvedValue({ data: persisted, isError: false });
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

  it.each(intermediateStatuses)("shows failed %s saves without rerunning the transaction step", (status) => {
    mutation = { isError: true, error: new Error("Transaction evidence is not available yet"), variables: { ...pending, status } };
    const element = renderProvider();
    const html = renderToStaticMarkup(element);
    expect(html).toContain("Transaction evidence is not available yet");
    expect(html).toContain("Retry");
    expect(html).not.toContain("Transaction step");
    expect(element.props.value.transfer).toBe(persisted);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("offers persistence-only recovery for same-stage error log saves", () => {
    mutation = { isError: true, error: new Error("Save failed"), variables: { ...persisted, logs: [{ error: "Signing failed" }] } };
    const html = renderToStaticMarkup(renderProvider());
    expect(html).toContain("Save failed");
    expect(html).toContain("Retry");
    expect(html).not.toContain("Transaction step");
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("leaves initial creation in the form with its existing navigation callback", () => {
    mutation = { isError: true, error: new Error("Save failed"), variables: { ...pending, status: "burn-sys" } };
    const html = renderToStaticMarkup(renderProvider({ ...persisted, status: "initialize" }));
    expect(html).toContain("Transaction step");
    expect(html).not.toContain("Retry");
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("leaves the transaction step visible when no failed save payload is available", () => {
    mutation = { isError: true, error: new Error("Save failed"), variables: undefined };
    const html = renderToStaticMarkup(renderProvider());
    expect(html).toContain("Transaction step");
    expect(html).not.toContain("Retry");
  });

  it.each(["completed", ...intermediateStatuses])("retries only the exact failed %s save, without adding logs or signing a new transaction", (status) => {
    const failedTransfer = { ...pending, status };
    mutation = { isError: true, error: new Error("Temporary verification failure"), variables: failedTransfer };
    const retryButton = renderProvider().props.children.props.action;
    retryButton.props.onClick();
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave.mock.calls[0][0]).toBe(failedTransfer);
    expect(mockSave.mock.calls[0][0].logs).toBe(failedTransfer.logs);
    expect(mockSetRetrying).toHaveBeenCalledWith(true);
    mockSave.mock.calls[0][1].onSettled();
    expect(mockSetRetrying).toHaveBeenLastCalledWith(false);
  });

  it.each(["completed", ...intermediateStatuses])("keeps transaction controls hidden and retry disabled while resaving %s", (status) => {
    retrying = true;
    mutation = { isError: false, isLoading: true, variables: { ...pending, status } };
    const element = renderProvider();
    const html = renderToStaticMarkup(element);
    expect(html).toContain("Saving transfer...");
    expect(html).not.toContain("Transaction step");
    expect(element.props.children.props.action.props.disabled).toBe(true);
    expect(element.props.value.transfer).toBe(persisted);
  });

  it("keeps accepted intermediate progress if the follow-up reload fails", async () => {
    const failedTransfer = { ...pending, status: "confirm-burn-sys" };
    const acceptedTransfer = { ...failedTransfer, logs: [{ transactionHash: "canonical" }] };
    cachedTransfer = { ...persisted, status: "burn-sys" };
    mutation = { isError: true, error: new Error("Temporary verification failure"), variables: failedTransfer };
    const retryButton = renderProvider().props.children.props.action;
    retryButton.props.onClick();

    mockRefetch.mockImplementation(async () => {
      expect(cachedTransfer).toBe(acceptedTransfer);
      return { data: cachedTransfer, isError: true, error: new Error("Reload failed") };
    });
    await mutationOptions.onSuccess(acceptedTransfer);
    expect(mockSetQueryData).toHaveBeenCalledWith(["transfer", persisted.id], acceptedTransfer);
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    mockSave.mock.calls[0][1].onSettled();

    mutation = { isError: false, isLoading: false, variables: failedTransfer };
    const element = renderProvider();
    expect(element.props.value.transfer).toBe(acceptedTransfer);
    expect(element.props.value.transfer.status).toBe("confirm-burn-sys");
    expect(renderToStaticMarkup(element)).toContain("Transaction step");
  });
});
