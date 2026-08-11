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
import { isAdminRoute } from "utils/app-route";

const queryClient = new QueryClient();

function MyApp({ Component, pageProps, router }: AppProps) {
  const isAdmin = isAdminRoute(router.pathname, router.asPath);
  const isBridge = router.pathname.includes("/bridge");

  // Keep wallet/query providers mounted across client-side route changes.
  // Replacing them while entering the bridge can strand requests and event
  // listeners owned by the outgoing page, leaving the new buttons inert.
  return (
    <QueryClientProvider client={queryClient}>
      <PaliWalletV2Provider>
        <MetamaskProvider>
          <NEVMProvider>
            {isBridge ? (
              <ThemeProvider theme={theme}>
                <WelcomeModal />
                <Component {...pageProps} />
              </ThemeProvider>
            ) : (
              <ConnectedWalletProvider>
                <ThemeProvider theme={theme}>
                  {!isAdmin && <WelcomeModal />}
                  <Component {...pageProps} />
                </ThemeProvider>
              </ConnectedWalletProvider>
            )}
          </NEVMProvider>
        </MetamaskProvider>
      </PaliWalletV2Provider>
    </QueryClientProvider>
  );
}

export default MyApp;
