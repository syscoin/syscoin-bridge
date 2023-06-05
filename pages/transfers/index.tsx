import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import { Alert, Box, Button, Container, Typography } from "@mui/material";
import DrawerPage from "components/DrawerPage";
import TransferDataGrid from "components/Transfer/DataGrid";
import WalletList from "components/WalletList";
import { useConnectedWallet } from "contexts/ConnectedWallet/useConnectedWallet";
import { ITransfer } from "contexts/Transfer/types";
import { NextPage } from "next";
import NextLink from "next/link";
import { useEffect, useState } from "react";

const TransfersPage: NextPage = () => {
  const [items, setItems] = useState<ITransfer[]>([]);
  const { utxo, nevm } = useConnectedWallet();
  const { version, isBitcoinBased } = usePaliWalletV2();
  const isPaliV2Connected = isBitcoinBased
    ? Boolean(utxo.account)
    : Boolean(nevm.account);
  const isFullyConnected =
    version === "v1"
      ? Boolean(utxo.account && nevm.account)
      : isPaliV2Connected;

  useEffect(() => {
    if (!localStorage) {
      return;
    }
    setItems(
      Object.entries(localStorage)
        .filter(([key]) => key.startsWith("transfer-"))
        .map(([key, value]) => JSON.parse(value))
    );
  }, []);

  return (
    <DrawerPage>
      <Container sx={{ py: 10 }}>
        <Typography variant="h5" marginBottom={"1rem"}>
          Transfers
        </Typography>
        <Box display="flex" mb={2}>
          <NextLink
            href={`/bridge/${version === "v2" ? "v2/" : ""}${Date.now()}`}
          >
            <Button sx={{ ml: "auto" }}>New Transfer</Button>
          </NextLink>
        </Box>
        <TransferDataGrid
          account={nevm.account}
          isFullyConnected={isFullyConnected}
          items={items}
          xpub={utxo.xpub}
          version={isPaliV2Connected ? version : undefined}
        />
        {!isFullyConnected && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body1">Connect both wallets</Typography>
          </Alert>
        )}
        <WalletList />
      </Container>
    </DrawerPage>
  );
};

export default TransfersPage;
