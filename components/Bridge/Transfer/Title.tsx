import { Typography } from "@mui/material";
import { useTransfer } from "../v3/context/TransferContext";

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
