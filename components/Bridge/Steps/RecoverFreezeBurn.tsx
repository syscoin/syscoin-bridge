import { Alert, Box, Button, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { useMutation, useQueryClient } from "react-query";
import { recoverExistingFreezeBurn } from "../recover-freeze-burn";

export default function RecoverFreezeBurn({ transferId }: { transferId: string }) {
  const [hash, setHash] = useState("");
  const queryClient = useQueryClient();
  const recovery = useMutation(["recover-freeze-burn", transferId], () => recoverExistingFreezeBurn(transferId, hash.trim()), {
    onSuccess: (transfer) => { queryClient.setQueryData(["transfer", transfer.id], transfer); },
  });
  return <Box sx={{ mt: 3 }}>
    <Typography>Already submitted this freeze-and-burn transaction? Recover it using its confirmed transaction hash. This does not sign or send another transaction.</Typography>
    <TextField label="Existing freeze-and-burn transaction hash" value={hash}
      onChange={(event) => setHash(event.target.value)} fullWidth disabled={recovery.isLoading} />
    <Button disabled={recovery.isLoading || !/^0x[0-9a-f]{64}$/i.test(hash.trim())}
      onClick={() => recovery.mutate()}>{recovery.isLoading ? "Verifying transaction..." : "Recover existing transaction"}</Button>
    {recovery.isError && <Alert severity="error">{recovery.error instanceof Error ? recovery.error.message : "Unable to recover transfer"}</Alert>}
  </Box>;
}
