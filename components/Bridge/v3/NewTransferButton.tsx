import { Button, ButtonProps } from "@mui/material";
import NextLink from "next/link";
import AddIcon from "@mui/icons-material/Add";

const BridgeV3NewTransferButton: React.FC<ButtonProps> = (props) => {
  return (
    <Button LinkComponent={NextLink} href="/bridge/v3/sys-to-nevm" {...props}>
      <AddIcon /> New Transfer
    </Button>
  );
};

export default BridgeV3NewTransferButton;
