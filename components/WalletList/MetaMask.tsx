import { Button, Box, Typography, Link } from "@mui/material";
import Image from "next/image";
import { useConnectedWallet } from "../../contexts/ConnectedWallet/useConnectedWallet";
import { Launch } from "@mui/icons-material";
import { useMetamask } from "@contexts/Metamask/Provider";
import { useState, useEffect } from "react";

const WalletListMetamask = () => {
  const { nevm, connectNEVM, availableWallets } = useConnectedWallet();
  const { isEnabled } = useMetamask();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Show consistent loading state during SSR
    return (
      <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
        <Image
          src="/metamask-logo.svg"
          height={32}
          width={32}
          alt="Metamask logo"
        />
        <Typography variant="body1">MetaMask</Typography>
        <Button sx={{ ml: "auto" }} variant="contained" disabled>
          Loading...
        </Button>
      </Box>
    );
  }

  // Skip rendering if this isn't the MetaMask connection type
  if (nevm.type !== "metamask") {
    return null;
  }

  return (
    <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
      <Image
        src="/metamask-logo.svg"
        height={32}
        width={32}
        alt="Metamask logo"
      />

      {nevm.type === "metamask" && nevm.account ? (
        <>
          <Typography variant="body1" color="secondary" noWrap maxWidth={"70%"}>
            {nevm.account}
          </Typography>
          <Typography variant="body1" color="success.main" sx={{ ml: "auto" }}>
            CONNECTED
          </Typography>
        </>
      ) : (
        <>
          <Typography variant="body1">MetaMask</Typography>
          {availableWallets.metamask && isEnabled ? (
            <Button
              sx={{ ml: "auto" }}
              variant="contained"
              onClick={() => connectNEVM("metamask")}
            >
              Connect
            </Button>
          ) : (
            <Link
              href="https://metamask.io/"
              title="Go to MetaMask"
              sx={{ ml: "auto" }}
              target="_blank"
            >
              <Button variant="contained">
                Install <Launch />
              </Button>
            </Link>
          )}
        </>
      )}
    </Box>
  );
};

export default WalletListMetamask;
