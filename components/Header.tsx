import { AppBar, Box, Button, Toolbar, Typography } from "@mui/material";
import { useEthers } from "@usedapp/core";
import { SyscoinLogo } from "./Icons/syscoin";
import { AccountBar } from "./HeaderElements/AccountBar";
import React, { FC } from "react";

const ConnectWallet = () => {
  const { activateBrowserWallet } = useEthers();
  return (
    <>
      <Button
        color="success"
        onClick={() => activateBrowserWallet()}
        variant="contained"
      >
        Connect wallet
      </Button>
    </>
  );
};

export const Header: FC = () => {
  const { account } = useEthers();

  return (
    <Box>
      <AppBar position="static">
        <Toolbar>
          <SyscoinLogo />
          <Typography variant="h6" component={"div"} sx={{ flexGrow: 1 }}>
            Syscoin Bridge
          </Typography>
          {account ? <AccountBar /> : <ConnectWallet />}
        </Toolbar>
      </AppBar>
    </Box>
  );
};

export default Header;
