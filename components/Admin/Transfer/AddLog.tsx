import { ITransfer } from "@contexts/Transfer/types";
import { Box, Button, Menu, MenuItem } from "@mui/material";
import { AddLogRequestPayload } from "api/types/admin/transfer/add-log";
import { useState } from "react";

export type SupportedOperations = AddLogRequestPayload["operation"];

type MenuItemEntry = {
  label: string;
  operation: SupportedOperations;
};

type Props = {
  transfer: ITransfer;
  onSelect: (item?: SupportedOperations) => void;
};

const AddLogMenu: React.FC<Props> = ({ transfer, onSelect }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = (operation?: SupportedOperations) => {
    onSelect(operation);
    setAnchorEl(null);
  };

  const logMenuItems: MenuItemEntry[] =
    transfer.type === "sys-to-nevm"
      ? [
          {
            label: "Add SYS Burn Transaction",
            operation: "burn-sys",
          },
          {
            label: "Add SYSX Burn Transaction",
            operation: "burn-sysx",
          },
          {
            label: "Add Proof-Submission Transaction",
            operation: "submit-proofs",
          },
        ]
      : [
          {
            label: "Add Freeze-and-Burn Transaction",
            operation: "freeze-burn-sys",
          },
          {
            label: "Add SYSX Mint Transaction",
            operation: "mint-sysx",
          },
          {
            label: "Add SYSX Burn Transaction",
            operation: "burn-sysx",
          },
        ];

  return (
    <Box>
      <Button onClick={handleClick}>Add Log</Button>
      <Menu
        id="add-log-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={() => handleClose()}
        MenuListProps={{
          "aria-labelledby": "basic-button",
        }}
      >
        {logMenuItems.map((item) => (
          <MenuItem
            key={item.operation}
            onClick={() => handleClose(item.operation)}
          >
            {item.label}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
};

export default AddLogMenu;
