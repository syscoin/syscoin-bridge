import { PaliWalletV2Provider } from "@contexts/PaliWallet/V2Provider";
import { ThemeProvider } from "@mui/material";
import type { AppContext, AppInitialProps, AppProps } from "next/app";
import { QueryClient, QueryClientProvider } from "react-query";
import theme from "../components/theme";
import ConnectedWalletProvider from "../contexts/ConnectedWallet/Provider";
import MetamaskProvider from "../contexts/Metamask/Provider";
import "../styles/globals.css";
import NEVMProvider from "@contexts/ConnectedWallet/NEVMProvider";
import WelcomeModal from "components/WelcomeModal";
import App from "next/app";

const queryClient = new QueryClient();

type AppOwnProps = {
  chainId: string;
};

function MyApp({
  Component,
  pageProps,
  router,
  chainId,
}: AppProps & AppOwnProps) {
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

MyApp.getInitialProps = async (
  context: AppContext
): Promise<AppOwnProps & AppInitialProps> => {
  const ctx = await App.getInitialProps(context);

  return { ...ctx, chainId: process.env.NEXT_PUBLIC_CHAIN_ID! };
};

export default MyApp;
