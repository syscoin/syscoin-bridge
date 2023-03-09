import "../styles/globals.css";
import type { AppProps } from "next/app";
import PaliWalletContextProvider from "../contexts/PaliWallet/Provider";
import MetamaskProvider from "../contexts/Metamask/Provider";
import theme from "../components/theme";
import { ThemeProvider } from "@mui/material";
import ConnectedWalletProvider from "../contexts/ConnectedWallet/Provider";
import { QueryClient, QueryClientProvider } from "react-query";
import { Config, DAppProvider } from "@usedapp/core";
import { Header } from "components/Header";
import {
  RolluxChain,
  TanenbaumChain,
} from "blockchain/NevmRolluxBridge/config/chainsUseDapp";
import { NetworkValidator } from "components/Common/NetworkValidator";

const queryClient = new QueryClient();

const dappConfig: Config = {
  readOnlyChainId: 5700,
  readOnlyUrls: {
    [5700]: "https://rpc.tanenbaum.io",
    [57000]: "https://rpc-bedrock.rollux.com/",
  },
  multicallAddresses: {
    [5700]: "0x1F359C32b5D8c9678b076eAac411A4d2Eb11E697", // multicall 2 address.
    [57000]: "0x1F359C32b5D8c9678b076eAac411A4d2Eb11E697",
  },
  networks: [RolluxChain, TanenbaumChain],
};

const BaseProviders: React.FC<{ children: React.ReactElement }> = ({
  children,
}) => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <PaliWalletContextProvider>
          <MetamaskProvider>
            <ConnectedWalletProvider>{children}</ConnectedWalletProvider>
          </MetamaskProvider>
        </PaliWalletContextProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

function MyApp({ Component, pageProps, router }: AppProps) {
  console.log({ path: router.pathname });
  if (router.pathname === "/bridge-nevm-rollux") {
    return (
      <BaseProviders>
        <DAppProvider config={dappConfig}>
          <NetworkValidator>
            <Header />
            <Component {...pageProps} />
          </NetworkValidator>
        </DAppProvider>
      </BaseProviders>
    );
  }

  return (
    <BaseProviders>
      <Component {...pageProps} />
    </BaseProviders>
  );
}

export default MyApp;
