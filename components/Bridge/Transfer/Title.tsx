import { useTransfer } from "@contexts/Transfer/useTransfer";
import { Typography } from "@mui/material";

const TransferTitle = () => {
  const { transfer } = useTransfer();

  return (
    <Typography variant="body1" sx={{ my: 3 }}>
      Transfer #
      {transfer == undefined || transfer.status === "initialize"
        ? "--------"
        : transfer.id}
    </Typography>
  );
};

export default TransferTitle;
