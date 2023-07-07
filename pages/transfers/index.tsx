import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import { Alert, Box, Button, Container, Typography } from "@mui/material";
import DrawerPage from "components/DrawerPage";
import { INavigationItem } from "components/Navigation/Item";
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
  const { version, isBitcoinBased, isEVMInjected } = usePaliWalletV2();
  const isPaliV2Connected = isBitcoinBased
    ? Boolean(utxo.account)
    : Boolean(nevm.account);
  const onlyV2 = version === "v2" && isEVMInjected;
  const isFullyConnected = onlyV2
    ? isPaliV2Connected
    : Boolean(utxo.account && nevm.account);

  const routes: INavigationItem[] = [
    {
      label: "New Transfer",
      path: `/bridge/${utxo.type === nevm.type ? "v2/" : ""}${Date.now()}`,
    },
    {
      label: "My Transfers",
      path: "/transfers",
    },
    {
      label: "FAQ",
      path: "/#faq",
    },
  ];

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
    <DrawerPage routes={routes}>
      <Container sx={{ py: 10 }}>
        <Typography variant="h5" marginBottom={"1rem"}>
          Transfers
        </Typography>
        <TransferDataGrid
          account={nevm.account}
          isFullyConnected={isFullyConnected}
          items={items}
          xpub={utxo.xpub}
          version={onlyV2 ? version : undefined}
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
