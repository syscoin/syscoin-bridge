import NEVMProvider from "@contexts/ConnectedWallet/NEVMProvider";
import ConnectedWalletProvider from "@contexts/ConnectedWallet/Provider";
import MetamaskProvider from "@contexts/Metamask/Provider";
import { PaliWalletV2Provider } from "@contexts/PaliWallet/V2Provider";
import { ITransfer } from "@contexts/Transfer/types";
import { Box, Button, Container, Typography } from "@mui/material";
import BlocktimeDisclaimer from "components/BlocktimeDisclaimer";
import TransferTitle from "components/Bridge/Transfer/Title";
import BridgeV3Stepper from "components/Bridge/v3/Stepper";
import BridgeV3ConnectValidateStep from "components/Bridge/v3/Steps/ConnectValidate";
import { TransferContextProvider } from "components/Bridge/v3/context/TransferContext";
import {
  GetServerSideProps,
  InferGetServerSidePropsType,
  NextPage,
} from "next";
import { useMemo } from "react";
import { QueryClient, QueryClientProvider } from "react-query";

import { getTransfer } from "services/transfer";
import isTransfer from "utils/isTransfer";

export const getServerSideProps: GetServerSideProps<{
  transfer: ITransfer;
}> = async (context) => {
  const { id } = context.query;
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

  try {
    const transfer = await getTransfer(id as string);
    if (!isTransfer(transfer)) {
      throw new Error("Invalid transfer");
    }
    return {
      props: {
        transfer,
      },
    };
  } catch (e) {
    console.log(e);
    return {
      notFound: true,
    };
  }
};

const BridgeV3Page: NextPage<
  InferGetServerSidePropsType<typeof getServerSideProps>
> = ({ transfer }) => {
  const queryClient = useMemo(() => new QueryClient(), []);
  return (
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
                    Trustlessly transfer SYS back and forth between the Syscoin
                    Base and Syscoin NEVM blockchains without middlemen!
                  </Typography>
                  <Box sx={{ display: "flex" }}>
                    <TransferTitle />
                    <Button></Button>
                  </Box>
                  <BridgeV3Stepper activeStep={0} transferType="nevm-to-sys" />
                  <BridgeV3ConnectValidateStep />
                </Container>
              </TransferContextProvider>
            </ConnectedWalletProvider>
          </NEVMProvider>
        </MetamaskProvider>
      </PaliWalletV2Provider>
    </QueryClientProvider>
  );
};

export default BridgeV3Page;
