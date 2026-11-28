import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const mockClearPending = jest.fn();
const mockSave = jest.fn<(transfer: { logs: unknown[] }, options: { onSettled: () => void }) => void>();
const mockSetRetrying = jest.fn<any>();
const mockRefetch = jest.fn<any>();
const mockGetWriteToken = jest.fn<(id: string) => string | undefined>();
const mockCreateWriteToken = jest.fn<(id: string) => string>();
const mockAuthorizeCreation = jest.fn<(options: unknown) => Promise<{ challenge: string; signedMessage: string }>>();
const mockSetQueryData = jest.fn<any>((_key: unknown, transfer: unknown) => {
  cachedTransfer = transfer;
});
let retrying = false;
let mutation: Record<string, unknown>;
let mutationOptions: any;
let loadTransfer: () => Promise<unknown>;
let transferReadError: unknown;
let saveTransfer: (transfer: unknown) => Promise<unknown>;
let cachedTransfer: unknown;
const creationCache = { current: undefined as unknown };
const persisted = { id: "transfer-1", status: "finalizing", logs: [] };
const pending = { ...persisted, status: "completed", logs: [{ transactionHash: "confirmed" }] };
const newTransfer = { ...persisted, status: "initialize" };
const createdTransfer = {
  ...persisted,
  status: "burn-sys",
  utxoAddress: "syscoin-address",
  nevmAddress: "nevm-address",
  amount: "0.5",
};
const creationAuthorization = { challenge: "challenge", signedMessage: "signature" };
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
  if (name === "react") return {
    ...React, useState: () => [retrying, mockSetRetrying], useRef: () => creationCache,
    useEffect: (effect: () => void) => effect(),
  };
  if (name === "../pending-native-conversion") return { clearPendingNativeConversion: mockClearPending };
  if (name === "@contexts/ConnectedWallet/NEVMProvider") return {
    useNEVM: () => ({ expectedChainId: "0x39" }),
  };
  if (name === "@contexts/PaliWallet/usePaliWallet") return {
    usePaliWalletV2: () => ({ version: "v1" }),
  };
  if (name === "../transfer-creation-authorization") return {
    requestTransferCreationAuthorization: mockAuthorizeCreation,
  };
  if (name === "react-query") return {
    useQuery: (_key: unknown, options: { queryFn: typeof loadTransfer }) => {
      loadTransfer = options.queryFn;
      return { data: cachedTransfer, error: transferReadError, refetch: mockRefetch };
    },
    useQueryClient: () => ({ setQueryData: mockSetQueryData }),
    useMutation: (_key: unknown, mutationFn: typeof saveTransfer, options: unknown) => {
      saveTransfer = mutationFn;
      mutationOptions = options;
      return { mutate: mockSave, ...mutation };
    },
  };
  if (name === "@mui/material") return {
    Alert: ({ children, action }: any) => React.createElement("section", { role: "alert" }, children, action),
    Button: ({ children, disabled }: any) => React.createElement("button", { disabled }, children),
  };
  if (name === "utils/transfer-write-token") return {
    getTransferWriteToken: mockGetWriteToken,
    getOrCreateTransferWriteToken: mockCreateWriteToken,
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
    transferReadError = undefined;
    creationCache.current = undefined;
    cachedTransfer = persisted;
    mockGetWriteToken.mockReset();
    mockCreateWriteToken.mockReturnValue("new-capability");
    mockAuthorizeCreation.mockResolvedValue(creationAuthorization);
    mockRefetch.mockResolvedValue({ data: persisted, isError: false });
    mutation = { isLoading: false, isError: false, variables: undefined };
  });
  afterEach(() => { jest.restoreAllMocks(); });

  it("resumes from a private capability without requiring an xpub in the detail response", async () => {
    mockGetWriteToken.mockReturnValue("original-capability");
    const savedTransfer = {
      ...persisted,
      utxoAddress: "syscoin-address",
      nevmAddress: "nevm-address",
      amount: "0.5",
    };
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(savedTransfer))
    );
    renderProvider();

    await expect(loadTransfer()).resolves.toEqual(savedTransfer);
    expect(fetchMock).toHaveBeenCalledWith(`/api/transfer/${persisted.id}`, {
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      headers: { Authorization: "Bearer original-capability" },
    });
  });

  it("explains unavailable direct links without showing the transfer step", async () => {
    const stub = { id: persisted.id } as typeof persisted;
    cachedTransfer = stub;
    jest.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 404 }));
    renderProvider(stub);

    await loadTransfer().catch((error) => { transferReadError = error; });
    const html = renderToStaticMarkup(renderProvider(stub));
    expect(html).toContain("This transfer is unavailable");
    expect(html).not.toContain("Transaction step");
  });

  it("submits new creation with the same capability that obtained the wallet challenge", async () => {
    cachedTransfer = newTransfer;
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(createdTransfer))
    );
    renderProvider(newTransfer);

    await expect(saveTransfer(createdTransfer)).resolves.toEqual(createdTransfer);
    expect(mockCreateWriteToken).toHaveBeenCalledWith(createdTransfer.id);
    expect(mockAuthorizeCreation).toHaveBeenCalledWith(expect.objectContaining({
      transfer: createdTransfer,
      writeToken: "new-capability",
      url: `/api/transfer/${createdTransfer.id}`,
    }));
    expect(fetchMock).toHaveBeenCalledWith(`/api/transfer/${createdTransfer.id}`, expect.objectContaining({
      method: "PATCH",
      headers: { Authorization: "Bearer new-capability", "Content-Type": "application/json" },
      body: JSON.stringify({ ...createdTransfer, creationAuthorization }),
    }));
  });

  it("reuses the same wallet authorization after a transport failure", async () => {
    cachedTransfer = newTransfer;
    const fetchMock = jest.spyOn(global, "fetch")
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce(new Response(JSON.stringify(createdTransfer)));
    renderProvider(newTransfer);

    await expect(saveTransfer(createdTransfer)).rejects.toThrow("response lost");
    await expect(saveTransfer(createdTransfer)).resolves.toEqual(createdTransfer);
    expect(mockAuthorizeCreation).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]).toEqual(fetchMock.mock.calls[1]);
  });

  it("shares one wallet request across simultaneous submits for the same intent", async () => {
    cachedTransfer = newTransfer;
    jest.spyOn(global, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify(createdTransfer))
    );
    renderProvider(newTransfer);

    await expect(Promise.all([
      saveTransfer(createdTransfer), saveTransfer(createdTransfer),
    ])).resolves.toEqual([createdTransfer, createdTransfer]);
    expect(mockAuthorizeCreation).toHaveBeenCalledTimes(1);
  });

  it("uses only the saved capability for progress updates", async () => {
    mockGetWriteToken.mockReturnValue("original-capability");
    const saved = { ...createdTransfer, status: "confirm-burn-sys" };
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(saved))
    );
    renderProvider();

    await expect(saveTransfer(saved)).resolves.toEqual(saved);
    expect(mockAuthorizeCreation).not.toHaveBeenCalled();
    expect(mockCreateWriteToken).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(`/api/transfer/${saved.id}`, expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify(saved),
      headers: { Authorization: "Bearer original-capability", "Content-Type": "application/json" },
    }));
  });

  it("renders the existing persisted step normally", () => {
    const element = renderProvider();
    expect(element.props.value.transfer).toBe(persisted);
    expect(renderToStaticMarkup(element)).toContain("Transaction step");
  });
  it("does not infer permission to continue an error from client-visible logs", () => {
    cachedTransfer = { ...persisted, type: "nevm-to-sys", status: "error", logs: [
      { status: "mint-sysx", payload: { data: { tx: "a".repeat(64) } } },
    ] };
    const element = renderProvider();
    expect(element.props.value.transfer).toBe(cachedTransfer);
    expect(element.props.value.transfer.status).toBe("error");
    expect((cachedTransfer as any).status).toBe("error");
  });
  it("retains the server-projected continuation without independently interpreting logs", () => {
    cachedTransfer = { ...persisted, type: "nevm-to-sys", status: "confirm-mint-sysx", logs: [] };
    expect(renderProvider().props.value.transfer).toBe(cachedTransfer);
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
    expect(html).toContain("Save failed");
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

  it("clears the pending conversion once the server has saved its hash", () => {
    const tx = "a".repeat(64);
    cachedTransfer = {
      ...persisted,
      status: "confirm-burn-sys",
      logs: [{ status: "burn-sys", payload: { data: { tx } } }],
    };
    renderProvider();
    expect(mockClearPending).toHaveBeenCalledWith(persisted.id, tx);
  });

  it("hides the conversion signing step while saving the broadcast transaction", () => {
    mutation = { isLoading: true, variables: { ...pending, status: "confirm-burn-sys" } };
    const html = renderToStaticMarkup(renderProvider());
    expect(html).toContain("Saving transfer...");
    expect(html).not.toContain("Transaction step");
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
