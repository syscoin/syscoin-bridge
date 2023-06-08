import { Button, Box, Typography, Link } from "@mui/material";
import Image from "next/image";
import { useConnectedWallet } from "../../contexts/ConnectedWallet/useConnectedWallet";
import { Launch } from "@mui/icons-material";
import {
  usePaliWallet,
  usePaliWalletV2,
} from "@contexts/PaliWallet/usePaliWallet";

const ConnectToPaliWallet = () => {
  const { connectUTXO, availableWallets } = useConnectedWallet();

  const checkPaliMessage =
    availableWallets.paliWallet === undefined
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
  const { isBitcoinBased, switchTo, isEVMInjected } = usePaliWalletV2();
  const isConnected = isBitcoinBased
    ? Boolean(utxo.account)
    : Boolean(nevm.account);
  if (utxo.type !== "pali-wallet" || !isConnected) {
    return (
      <>
        <Typography variant="body1">PaliWallet</Typography>
        <Link href="https://paliwallet.com/" title="Go to PaliWallet">
          <Launch />
        </Link>
        <ConnectToPaliWallet />
      </>
    );
  }

  const connectedAccount = isBitcoinBased ? utxo.account : nevm.account;

  return (
    <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
      <Image
        src="/pali-wallet-logo.svg"
        height={32}
        width={32}
        alt="PaliWallet logo"
      />
      <Typography variant="body1" color="secondary" noWrap maxWidth={"70%"}>
        {connectedAccount}
      </Typography>
      <Typography variant="body1" color="success.main" sx={{ ml: "auto" }}>
        CONNECTED
      </Typography>
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
  );
};

const WalletListPaliWallet = () => {
  const { utxo } = useConnectedWallet();
  const { version } = usePaliWallet();

  if (version === "v2") {
    return <PaliWalletV2 />;
  }

  if (utxo.type !== "pali-wallet" || !utxo.account) {
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
