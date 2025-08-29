import NEVMProvider from "@contexts/ConnectedWallet/NEVMProvider";
import ConnectedWalletProvider from "@contexts/ConnectedWallet/Provider";
import MetamaskProvider from "@contexts/Metamask/Provider";
import { PaliWalletV2Provider } from "@contexts/PaliWallet/V2Provider";
import {
  COMMON_STATUS,
  ITransfer,
  TransferType,
} from "@contexts/Transfer/types";
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Typography,
} from "@mui/material";
import BlocktimeDisclaimer from "components/BlocktimeDisclaimer";
import TransferTitle from "components/Bridge/Transfer/Title";
import BridgeSavingIndicator from "components/Bridge/SavingIndicator";
import BridgeStepSwitch from "components/Bridge/StepSwitch";
import BridgeStepper from "components/Bridge/Stepper";
import { SyscoinProvider } from "components/Bridge/context/Syscoin";
import {
  TransferContextProvider,
  useTransfer,
} from "components/Bridge/context/TransferContext";
import { Web3Provider } from "components/Bridge/context/Web";
import { NextPage } from "next";
import { useRouter } from "next/router";
import { useMemo } from "react";
import { QueryClient, QueryClientProvider } from "react-query";
import TableRowsIcon from "@mui/icons-material/TableRows";
import NextLink from "next/link";
import BridgeTransferSwitchTypeCard from "components/Bridge/TransferSwitchTypeCard";
import BridgeNewTransferButton from "components/Bridge/NewTransferButton";

const NewTransferButton = () => {
  const { transfer } = useTransfer();

  if (transfer.status !== "completed") {
    return null;
  }

  return <BridgeNewTransferButton />;
};

const createTransfer = (type: TransferType): ITransfer => ({
  amount: "0",
  id: `${Date.now()}`,
  type,
  status: COMMON_STATUS.INITIALIZE,
  logs: [],
  createdAt: Date.now(),
  version: "v2",
  agreedToTerms: false,
});

const BridgePage: NextPage = () => {
  const { query } = useRouter();
  // Create a new QueryClient when the transfer ID changes to avoid stale data
  const queryClient = useMemo(() => new QueryClient(), [query.id]);

  const initialTransfer = useMemo(() => {
    const id = query.id;
    if (id === "sys-to-nevm" || id === "nevm-to-sys") {
      return createTransfer(id);
    }
    return {
      id,
    } as ITransfer;
  }, [query.id]);

  return (
    <QueryClientProvider client={queryClient}>
      <SyscoinProvider>
        <Web3Provider>
          <PaliWalletV2Provider>
            <MetamaskProvider>
              <NEVMProvider>
                <ConnectedWalletProvider>
                  <TransferContextProvider transfer={initialTransfer}>
                    <Container sx={{ mt: 10, mb: 15 }}>
                      <BlocktimeDisclaimer />
                      <Typography variant="h5" fontWeight="bold">
                        Bridge Your SYS
                      </Typography>
                      <Typography variant="caption" color="gray">
                        Trustlessly transfer SYS back and forth between the
                        Syscoin UTXO and Syscoin NEVM blockchains without
                        middlemen!
                      </Typography>
                      <Box sx={{ my: 3 }}>
                        <TransferTitle />
                        <Button LinkComponent={NextLink} href="/transfers">
                          <TableRowsIcon />
                          View All Transfers
                        </Button>
                        <NewTransferButton />
                      </Box>
                      <BridgeStepper />
                      <Box sx={{ mt: 3, mb: 2, width: "50%" }}>
                        <BridgeTransferSwitchTypeCard />
                      </Box>
                      <Card
                        sx={{
                          mt: 1,
                          display: "flex",
                          flexDirection: "column",
                          minWidth: "20rem",
                          width: "50%",
                        }}
                      >
                        <CardContent>
                          <BridgeStepSwitch />
                          <BridgeSavingIndicator />
                        </CardContent>
                      </Card>
                    </Container>
                  </TransferContextProvider>
                </ConnectedWalletProvider>
              </NEVMProvider>
            </MetamaskProvider>
          </PaliWalletV2Provider>
        </Web3Provider>
      </SyscoinProvider>
    </QueryClientProvider>
  );
};

export default BridgePage;
