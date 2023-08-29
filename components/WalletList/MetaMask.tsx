import { Button, Box, Typography, Link } from "@mui/material";
import Image from "next/image";
import { useConnectedWallet } from "../../contexts/ConnectedWallet/useConnectedWallet";
import { Launch } from "@mui/icons-material";

const WalletListMetamask = () => {
  const { nevm, connectNEVM, availableWallets } = useConnectedWallet();
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
          <Typography variant="body1" color="secondary">
            {nevm.account}
          </Typography>
          <Typography variant="body1" color="success.main" sx={{ ml: "auto" }}>
            CONNECTED
          </Typography>
        </>
      ) : (
        <>
          <Typography variant="body1">Metamask</Typography>
          {availableWallets.metamask ? (
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
              title="Go to Metamask"
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
