import { PaliWalletV2Provider } from "@contexts/PaliWallet/V2Provider";
import { ThemeProvider } from "@mui/material";
import type { AppProps } from "next/app";
import { QueryClient, QueryClientProvider } from "react-query";
import theme from "../components/theme";
import ConnectedWalletProvider from "../contexts/ConnectedWallet/Provider";
import MetamaskProvider from "../contexts/Metamask/Provider";
import "../styles/globals.css";
import NEVMProvider from "@contexts/ConnectedWallet/NEVMProvider";
import WelcomeModal from "components/WelcomeModal";

const queryClient = new QueryClient();

const chainId = process.env.NEXT_PUBLIC_CHAIN_ID!;

function MyApp({ Component, pageProps, router }: AppProps) {
  const isAdmin = router.pathname.includes("/admin");
  if (router.pathname.includes("/bridge")) {
    return (
      <ThemeProvider theme={theme}>
        <WelcomeModal />
        <Component {...pageProps} />
      </ThemeProvider>
    );
  }
  return (
    <QueryClientProvider client={queryClient}>
      <PaliWalletV2Provider chainId={chainId}>
        <MetamaskProvider>
          <NEVMProvider>
            <ConnectedWalletProvider>
              <ThemeProvider theme={theme}>
                {!isAdmin && <WelcomeModal />}
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
