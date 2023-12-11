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

function MyApp({ Component, pageProps, router }: AppProps) {
  const isAdmin = router.pathname.includes("/admin");
  if (router.pathname.includes("/bridge/v3/")) {
    return (
      <ThemeProvider theme={theme}>
        <WelcomeModal />
        <Component {...pageProps} />
      </ThemeProvider>
    );
  }
  return (
    <QueryClientProvider client={queryClient}>
      <PaliWalletV2Provider>
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
