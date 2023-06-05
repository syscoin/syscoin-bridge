import { PaliWalletV2Provider } from "@contexts/PaliWallet/V2Provider";
import { ThemeProvider } from "@mui/material";
import { Config } from "@usedapp/core";
import {
  RolluxChain,
  TanenbaumChain,
} from "blockchain/NevmRolluxBridge/config/chainsUseDapp";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { QueryClient, QueryClientProvider } from "react-query";
import theme from "../components/theme";
import ConnectedWalletProvider from "../contexts/ConnectedWallet/Provider";
import MetamaskProvider from "../contexts/Metamask/Provider";
import "../styles/globals.css";
import NEVMProvider from "@contexts/ConnectedWallet/NEVMProvider";

const queryClient = new QueryClient();

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <PaliWalletV2Provider>
        <MetamaskProvider>
          <NEVMProvider>
            <ConnectedWalletProvider>
              <ThemeProvider theme={theme}>
                <Component {...pageProps} />
              </ThemeProvider>
            </ConnectedWalletProvider>
          </NEVMProvider>
        </MetamaskProvider>
      </PaliWalletV2Provider>
    </QueryClientProvider>
  );
}

export default MyApp;
