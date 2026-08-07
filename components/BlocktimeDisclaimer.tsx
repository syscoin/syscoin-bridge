import { Alert, Snackbar } from "@mui/material";
import { useState } from "react";

const BlocktimeDisclaimer = () => {
  const [open, setOpen] = useState(true);
  const handleClose = (
    event: React.SyntheticEvent | Event,
    reason?: string
  ) => {
    if (reason === "clickaway") {
      return;
    }

    setOpen(false);
  };
  return (
    <Snackbar
      open={open}
      onClose={handleClose}
      anchorOrigin={{
        horizontal: "right",
        vertical: "bottom",
      }}
      autoHideDuration={30000}
    >
      <Alert onClose={handleClose} severity="info" sx={{ width: "100%" }}>
        Syscoin targets a 2.5-minute block time. Some bridge steps wait for
        block inclusion or confirmation, so completion times vary with network
        conditions.
      </Alert>
    </Snackbar>
  );
};

export default BlocktimeDisclaimer;
