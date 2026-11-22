import { Alert, Box, Button, List, ListItem, Typography } from "@mui/material";
import NextLink from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "react-query";
import { listTransferWriteTokenIds } from "utils/transfer-write-token";
import { DRAFTS_PER_PAGE, readPrivateDrafts } from "./private-drafts";

const PrivateDrafts = () => {
  const [ids, setIds] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  useEffect(() => setIds(listTransferWriteTokenIds()), []);

  const offset = page * DRAFTS_PER_PAGE;
  const pageIds = ids.slice(offset, offset + DRAFTS_PER_PAGE);
  const hasMore = offset + DRAFTS_PER_PAGE < ids.length;
  const { data, isFetching, refetch } = useQuery(
    ["private-transfer-drafts", pageIds],
    ({ signal }) => readPrivateDrafts(pageIds, signal),
    { enabled: pageIds.length > 0, cacheTime: 0 }
  );
  const drafts = data?.drafts ?? [];
  if (drafts.length === 0 && !data?.hasError && !isFetching && !hasMore && page === 0) {
    return null;
  }

  return (
    <Box component="section" aria-label="Your drafts" sx={{ mb: 3 }}>
      <Typography variant="h6">Your drafts</Typography>
      {data?.hasError && (
        <Alert severity="error" action={<Button onClick={() => refetch()}>Retry</Button>}>
          Some drafts are temporarily unavailable.
        </Alert>
      )}
      {drafts.length ? (
        <List dense>
          {drafts.map((draft) => (
            <ListItem key={draft.id} disableGutters>
              <Button component={NextLink} href={`/bridge/${draft.id}`} sx={{ textTransform: "none", overflowWrap: "anywhere" }}>
                {draft.type === "sys-to-nevm" ? "UTXO → NEVM" : "NEVM → UTXO"}
                {` · ${draft.amount} SYS · ${draft.id}`}
              </Button>
            </ListItem>
          ))}
        </List>
      ) : (
        <Typography variant="body2" role="status">
          {isFetching ? "Loading your drafts…" : "No drafts on this page."}
        </Typography>
      )}
      {(page > 0 || hasMore) && (
        <Box sx={{ display: "flex", gap: 2 }}>
          <Button disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous drafts
          </Button>
          <Button disabled={!hasMore || isFetching} onClick={() => setPage(page + 1)}>
            More drafts
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default PrivateDrafts;
