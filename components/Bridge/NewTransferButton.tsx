import { Button, ButtonProps } from "@mui/material";
import NextLink from "next/link";
import AddIcon from "@mui/icons-material/Add";

const BridgeNewTransferButton: React.FC<ButtonProps> = (props) => {
  return (
    <Button LinkComponent={NextLink} href="/bridge/sys-to-nevm" {...props}>
      <AddIcon /> New Transfer
    </Button>
  );
};

export default BridgeNewTransferButton;
