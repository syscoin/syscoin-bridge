import NEVMProvider from "@contexts/ConnectedWallet/NEVMProvider";
import ConnectedWalletProvider from "@contexts/ConnectedWallet/Provider";
import MetamaskProvider from "@contexts/Metamask/Provider";
import { PaliWalletV2Provider } from "@contexts/PaliWallet/V2Provider";
import { ITransfer } from "@contexts/Transfer/types";
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
import BridgeV3SavingIndicator from "components/Bridge/v3/SavingIndicator";
import BridgeV3StepSwitch from "components/Bridge/v3/StepSwitch";
import BridgeV3Stepper from "components/Bridge/v3/Stepper";
import { SyscoinProvider } from "components/Bridge/v3/context/Syscoin";
import { TransferContextProvider } from "components/Bridge/v3/context/TransferContext";
import { Web3Provider } from "components/Bridge/v3/context/Web";
import {
  GetServerSideProps,
  InferGetServerSidePropsType,
  NextPage,
} from "next";
import { useMemo } from "react";
import { QueryClient, QueryClientProvider } from "react-query";

export const getServerSideProps: GetServerSideProps<{
  transfer: ITransfer;
}> = async (context) => {
  const { id } = context.query;
  if (!id) {
    return {
      notFound: true,
    };
  }
  if (id === "sys-to-nevm" || id === "nevm-to-sys") {
    return {
      props: {
        transfer: {
          amount: "0",
          id: `${Date.now()}`,
          type: id,
          status: "initialize",
          logs: [],
          createdAt: Date.now(),
          version: "v2",
        },
      },
    };
  }

  return {
    props: {
      transfer: {
        id,
      } as ITransfer,
    },
  };
};

const BridgeV3Page: NextPage<
  InferGetServerSidePropsType<typeof getServerSideProps>
> = ({ transfer }) => {
  const queryClient = useMemo(() => new QueryClient(), []);
  return (
    <SyscoinProvider>
      <Web3Provider>
        <QueryClientProvider client={queryClient}>
          <PaliWalletV2Provider>
            <MetamaskProvider>
              <NEVMProvider>
                <ConnectedWalletProvider>
                  <TransferContextProvider transfer={transfer}>
                    <Container sx={{ mt: 10 }}>
                      <BlocktimeDisclaimer />
                      <Typography variant="h5" fontWeight="bold">
                        Bridge Your SYS
                      </Typography>
                      <Typography variant="caption" color="gray">
                        Trustlessly transfer SYS back and forth between the
                        Syscoin Base and Syscoin NEVM blockchains without
                        middlemen!
                      </Typography>
                      <Box sx={{ display: "flex" }}>
                        <TransferTitle />
                        <Button></Button>
                      </Box>
                      <BridgeV3Stepper />
                      <Card
                        sx={{
                          mt: 5,
                          display: "flex",
                          flexDirection: "column",
                          minWidth: "20rem",
                          width: "50%",
                        }}
                      >
                        <CardContent>
                          <BridgeV3StepSwitch />
                          <BridgeV3SavingIndicator />
                        </CardContent>
                      </Card>
                    </Container>
                  </TransferContextProvider>
                </ConnectedWalletProvider>
              </NEVMProvider>
            </MetamaskProvider>
          </PaliWalletV2Provider>
        </QueryClientProvider>
      </Web3Provider>
    </SyscoinProvider>
  );
};

export default BridgeV3Page;
