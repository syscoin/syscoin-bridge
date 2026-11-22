import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import React from "react";
import ts from "typescript";

let page: number;
let queryResult: {
  data?: { transfers: unknown[]; hasMore: boolean };
  error?: Error;
  isFetching?: boolean;
};
let loadHistory: (context: { signal?: AbortSignal }) => Promise<unknown>;
let queryKey: unknown;
const setPage = jest.fn<(page: number) => void>();

// Compile JSX for this component in the Jest node environment.
const compiled = ts.transpileModule(readFileSync(join(__dirname, "DataGrid.tsx"), "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
}).outputText;
const componentExports: Record<string, any> = {};
new Function("require", "exports", compiled)((name: string) => {
  if (name === "react") return { ...React, useState: () => [page, setPage] };
  if (name === "react-query") {
    return {
      useQuery: (key: unknown, query: typeof loadHistory) => {
        queryKey = key;
        loadHistory = query;
        return queryResult;
      },
    };
  }
  if (name === "@mui/x-data-grid") return { DataGrid: () => null };
  if (name === "./columns") return { TRANSFER_COLUMNS: [] };
  return require(name);
}, componentExports);

const localItems = [{ id: "local-transfer" }];
const renderGrid = () => componentExports.default({
  nevm: "nevm-account",
  utxoAddress: "syscoin-address",
  utxoXpub: "private-account",
  version: "v2",
  isFullyConnected: true,
  items: localItems,
});

describe("wallet transfer history", () => {
  beforeEach(() => {
    page = 1;
    queryResult = {};
    setPage.mockClear();
  });

  afterEach(() => { jest.restoreAllMocks(); });

  it("queries the requested page with the account key only in the POST body", async () => {
    page = 2;
    const transfers = [{ id: "remote-transfer" }];
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(transfers), {
        headers: { "X-Bridge-Has-More": "1" },
      })
    );
    renderGrid();

    await expect(loadHistory({})).resolves.toEqual({ transfers, hasMore: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/transfer", expect.objectContaining({
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      body: JSON.stringify({
        nevm: "nevm-account",
        utxoAddress: "syscoin-address",
        utxoXpub: "private-account",
        version: "v2",
        page: 2,
      }),
    }));
    expect(JSON.stringify(queryKey)).not.toContain("private-account");
  });

  it("retains local history when a remote page fails", () => {
    queryResult = { error: new Error("Unavailable") };
    const [, localLabel, grid] = renderGrid().props.children;
    expect(localLabel.props.children).toBe("Transfers stored in this browser");
    expect(grid.props.rows).toBe(localItems);
  });

  it("lets the user page through the selected wallet's results", () => {
    page = 2;
    queryResult = { data: { transfers: [{ id: "remote-transfer" }], hasMore: true } };
    const [, localLabel, grid, controls] = renderGrid().props.children;
    expect(localLabel).toBe(false);
    const [previous, , next] = controls.props.children;
    expect(grid.props.rows).toEqual(queryResult.data?.transfers);
    expect(previous.props.disabled).toBe(false);
    expect(next.props.disabled).toBe(false);
    previous.props.onClick();
    next.props.onClick();
    expect(setPage.mock.calls).toEqual([[1], [3]]);
  });
});
