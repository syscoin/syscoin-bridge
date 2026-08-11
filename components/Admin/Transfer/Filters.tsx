import { Box, Button, TextField } from "@mui/material";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

const AdminTransferFilters: React.FC = () => {
  const { isReady, query } = useRouter();
  const queryId = Array.isArray(query.id) ? query.id[0] : query.id;
  const [id, setId] = useState(queryId ?? "");

  useEffect(() => {
    if (isReady) {
      setId(queryId ?? "");
    }
  }, [isReady, queryId]);

  return (
    <Box component="form" sx={{ mt: 2, alignItems: "center", display: "flex" }}>
      <TextField
        name="id"
        label="ID"
        placeholder="Enter transfer ID"
        value={id}
        onChange={(e) => setId(e.target.value)}
      />
      <Button type="submit" sx={{ ml: 2 }}>
        Filter
      </Button>
    </Box>
  );
};

export default AdminTransferFilters;
