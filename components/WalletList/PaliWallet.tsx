import { Button, Box, Typography, Link } from "@mui/material";
import Image from "next/image";
import { useConnectedWallet } from "../../contexts/ConnectedWallet/useConnectedWallet";
import { Launch } from "@mui/icons-material";
import {
  usePaliWallet,
  usePaliWalletV2,
} from "@contexts/PaliWallet/usePaliWallet";
import Web3 from "web3";

const InstallPaliWallet = () => {
  return (
    <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
      <Image
        src="/pali-wallet-logo.svg"
        height={32}
        width={32}
        alt="PaliWallet logo"
      />
      <Typography variant="body1">PaliWallet</Typography>
      <Link href="https://paliwallet.com/" title="Go to PaliWallet">
        <Launch />
      </Link>
      <ConnectToPaliWallet />
    </Box>
  );
};

const ConnectToPaliWallet = () => {
  const { connectUTXO, availableWallets } = useConnectedWallet();
  const { isLoading } = usePaliWalletV2();

  const checkPaliMessage =
    availableWallets.paliWallet === undefined || isLoading
      ? "Checking Pali Wallet"
      : "Not installed";

  return (
    <Button
      sx={{ ml: "auto" }}
      variant="contained"
      onClick={() => connectUTXO("pali-wallet")}
      disabled={!availableWallets.paliWallet}
    >
      {availableWallets.paliWallet ? "Connect" : checkPaliMessage}
    </Button>
  );
};

const PaliWalletV2 = () => {
  const { utxo, nevm } = useConnectedWallet();
  const { isBitcoinBased, switchTo, isInstalled, isEVMInjected } =
    usePaliWalletV2();
  const connectedAccount = isBitcoinBased ? utxo.account : nevm.account;
  const isConnected = Boolean(connectedAccount);

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
  const { version } = usePaliWallet();

  if (version === "v2") {
    return <PaliWalletV2 />;
  }

  if (utxo.type !== "pali-wallet" || !utxo.account) {
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
