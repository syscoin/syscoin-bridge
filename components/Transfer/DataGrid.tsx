import { ITransfer } from "@contexts/Transfer/types";
import { Alert, Box, Button, Typography } from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import NextLink from "next/link";
import { useState } from "react";
import { useQuery } from "react-query";
import { TRANSFER_COLUMNS } from "./columns";

type TransferDataGridProps = {
  nevm?: string;
  utxoAddress?: string;
  utxoXpub?: string;
  isFullyConnected: boolean;
  items: ITransfer[];
  version?: string;
};

const TRANSFERS_PER_PAGE = 50;
const MAX_HISTORY_PAGE = 100;

const TransferDataGrid: React.FC<TransferDataGridProps> = ({
  nevm,
  utxoAddress,
  utxoXpub,
  isFullyConnected,
  items,
  version,
}) => {
  const [page, setPage] = useState(1);
  const canLoadHistory =
    isFullyConnected && Boolean(nevm || utxoAddress || utxoXpub);
  const { data, isFetching, error } = useQuery(
    ["transfer-history", nevm, utxoAddress, Boolean(utxoXpub), version, page],
    async ({ signal }) => {
      const response = await fetch("/api/transfer", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nevm, utxoAddress, utxoXpub, version, page }),
        signal,
      });
      if (!response.ok) {
        throw new Error("Unable to load transfer history");
      }

      const transfers: ITransfer[] = await response.json();
      if (!Array.isArray(transfers)) {
        throw new Error("Invalid transfer history");
      }
      return {
        transfers,
        hasMore: response.headers.get("X-Bridge-Has-More") === "1",
      };
    },
    { enabled: canLoadHistory, keepPreviousData: true }
  );
  const remoteHistory = canLoadHistory && !error ? data : undefined;

  return (
    <>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Transfer history is temporarily unavailable. Local transfers are
          shown when available.
        </Alert>
      )}
      <DataGrid
        loading={isFetching}
        columns={[
          {
            field: "id",
            headerName: "ID",
            width: 130,
            renderCell: ({ value }) => (
              <NextLink href={`/bridge/${value}`}>
                <Typography
                  variant="body2"
                  color="primary"
                  sx={{ cursor: "pointer" }}
                >
                  {value}
                </Typography>
              </NextLink>
            ),
          },
          ...TRANSFER_COLUMNS,
        ]}
        rows={remoteHistory?.transfers ?? items}
        pageSize={TRANSFERS_PER_PAGE}
        rowsPerPageOptions={[TRANSFERS_PER_PAGE]}
        hideFooter={Boolean(remoteHistory)}
        sx={{ background: "white", mb: 2 }}
        autoHeight
        error={undefined}
      />
      {canLoadHistory && (page > 1 || remoteHistory?.hasMore) && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
          <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <Typography variant="body2">Page {page}</Typography>
          <Button
            disabled={
              isFetching || page >= MAX_HISTORY_PAGE || !remoteHistory?.hasMore
            }
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </Box>
      )}
    </>
  );
};

export default TransferDataGrid;
