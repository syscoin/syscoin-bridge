import { useTransfer } from "@contexts/Transfer/useTransfer";
import { Typography } from "@mui/material";

const TransferTitle = () => {
  const { transfer } = useTransfer();
  if (transfer.status === "initialize") {
    return (
      <Typography variant="body1" sx={{ my: 3 }}>
        New Transfer
      </Typography>
    );
  }
  return (
    <Typography variant="body1" sx={{ my: 3 }}>
      Transfer #{transfer.id}
    </Typography>
  );
};

export default TransferTitle;
