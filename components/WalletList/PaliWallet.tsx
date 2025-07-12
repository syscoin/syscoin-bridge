import { Button, Box, Typography, Link } from "@mui/material";
import Image from "next/image";
import { useConnectedWallet } from "../../contexts/ConnectedWallet/useConnectedWallet";
import { Launch } from "@mui/icons-material";
import {
  usePaliWallet,
  usePaliWalletV2,
} from "@contexts/PaliWallet/usePaliWallet";
import Web3 from "web3";
import { useState, useEffect } from "react";

const InstallPaliWallet = () => {
  const { connectWallet, isInstalled } = usePaliWallet();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Show loading state during SSR
    return (
      <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
        <Image
          src="/pali-wallet-logo.svg"
          height={32}
          width={32}
          alt="PaliWallet logo"
        />
        <Typography variant="body1">Pali Wallet</Typography>
        <Button sx={{ ml: "auto" }} variant="contained" disabled>
          Loading...
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
      <Image
        src="/pali-wallet-logo.svg"
        height={32}
        width={32}
        alt="PaliWallet logo"
      />
      <Typography variant="body1">Pali Wallet</Typography>
      {!isInstalled ? (
        <Link
          href="https://paliwallet.com/"
          title="Go to PaliWallet"
          sx={{ ml: "auto" }}
          target="_blank"
        >
          <Button variant="contained">
            Install <Launch />
          </Button>
        </Link>
      ) : (
        <Button sx={{ ml: "auto" }} variant="contained" onClick={connectWallet}>
          Connect
        </Button>
      )}
    </Box>
  );
};

const PaliWalletV2 = () => {
  const { utxo, nevm } = useConnectedWallet();
  const { isBitcoinBased, switchTo, isInstalled, isEVMInjected } =
    usePaliWalletV2();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const connectedAccount = isBitcoinBased ? utxo.account : nevm.account;
  const isConnected = Boolean(connectedAccount);

  if (!mounted) {
    // Show loading state during SSR
    return (
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center" }}>
          <Image
            src="/pali-wallet-logo.svg"
            height={32}
            width={32}
            alt="PaliWallet logo"
          />
          <Typography variant="body1">Loading...</Typography>
        </Box>
      </Box>
    );
  }

  if (utxo.type !== "pali-wallet" || !isInstalled || !isConnected) {
    return <InstallPaliWallet />;
  }

  const isInvalidSyscoinAddress =
    !isEVMInjected && Web3.utils.isAddress(connectedAccount!);

  const isValidAddress = !isInvalidSyscoinAddress;

  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <Image
          src="/pali-wallet-logo.svg"
          height={32}
          width={32}
          alt="PaliWallet logo"
        />
        <Typography variant="body1" color="secondary" noWrap maxWidth={"70%"}>
          {connectedAccount}
        </Typography>

        {isValidAddress && (
          <>
            <Typography
              variant="body1"
              color="success.main"
              sx={{ ml: "auto" }}
            >
              CONNECTED
            </Typography>
          </>
        )}

        {isEVMInjected && (
          <Button
            variant="contained"
            onClick={() => switchTo(isBitcoinBased ? "ethereum" : "bitcoin")}
            sx={{ ml: 2 }}
          >
            Switch
          </Button>
        )}
      </Box>
      {isInvalidSyscoinAddress && (
        <Typography
          variant="caption"
          color="error"
          sx={{ ml: "auto", display: "block" }}
        >
          Invalid network selected. Please switch to UTXO Network.
        </Typography>
      )}
    </Box>
  );
};

const WalletListPaliWallet = () => {
  const { utxo } = useConnectedWallet();
  const { version, isInstalled } = usePaliWallet();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Show consistent loading state during SSR
    return (
      <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
        <Image
          src="/pali-wallet-logo.svg"
          height={32}
          width={32}
          alt="PaliWallet logo"
        />
        <Typography variant="body1">Pali Wallet</Typography>
        <Button sx={{ ml: "auto" }} variant="contained" disabled>
          Loading...
        </Button>
      </Box>
    );
  }

  if (version === "v2") {
    return <PaliWalletV2 />;
  }

  if (utxo.type !== "pali-wallet" || !isInstalled || !utxo.account) {
    return <InstallPaliWallet />;
  }

  return (
    <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
      <Image
        src="/pali-wallet-logo.svg"
        height={32}
        width={32}
        alt="PaliWallet logo"
      />
      <Typography variant="body1" color="secondary" noWrap maxWidth={"70%"}>
        {utxo.account}
      </Typography>
      <Typography variant="body1" color="success.main" sx={{ ml: "auto" }}>
        CONNECTED
      </Typography>
    </Box>
  );
};

export default WalletListPaliWallet;
