import { ITransfer } from "@contexts/Transfer/types";
import { Box, Button, Menu, MenuItem } from "@mui/material";
import { AddLogRequestPayload } from "api/types/admin/transfer/add-log";
import { useState } from "react";

export type SupportedOperations = AddLogRequestPayload["operation"];

type Props = {
  transfer: ITransfer;
  onSelect: (item: SupportedOperations) => void;
};

const AddLogMenu: React.FC<Props> = ({ onSelect }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = (operation: SupportedOperations) => {
    onSelect(operation);
    setAnchorEl(null);
  };
  return (
    <Box>
      <Button onClick={handleClick}>Add Log</Button>
      <Menu
        id="add-log-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        MenuListProps={{
          "aria-labelledby": "basic-button",
        }}
      >
        <MenuItem onClick={() => handleClose("burn-sys")}>
          Add Burn Sys Transaction
        </MenuItem>
        <MenuItem onClick={() => handleClose("burn-sysx")}>
          Add Burn Sysx Transaction
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default AddLogMenu;
