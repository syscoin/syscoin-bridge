import { Box, Container, Grid, Typography, Link } from "@mui/material";

import type { NextPage } from "next";
import Head from "next/head";

import HomeHowItWorks from "components/Home/HowItWorks";
import ContactUs from "components/Home/ContactUs";
import FAQ from "components/Home/FAQ";
import Footer from "components/Footer";
import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import NextImage from "next/image";
import BridgeMetamaskNevmInstructions from "components/Bridge/MetamaskNevmInstructions";

import PaliAndMetamaskBridge from "components/Home/PaliMetamaskBridge";
import PaliV2Bridge from "components/Home/PaliV2Bridge";

const Home: NextPage = () => {
  const { isInstalled, version, isEVMInjected } = usePaliWalletV2();

  const isPaliVersion2 =
    isInstalled && version && version === "v2" && isEVMInjected;

  const commitHash = process.env.NEXT_PUBLIC_COMMIT_HASH || "";
  const repoUrl = process.env.NEXT_PUBLIC_REPO_URL || "";
  const shortHash = commitHash ? commitHash.slice(0, 7) : "";

  return (
    <Box>
      <Head>
        <title>Syscoin Bridge</title>
        <link rel="shortcut icon" href="/favicon.ico" />
        <meta name="description" content="Syscoin Trustless Bridge" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <Box component="main">
        <Grid component={Container} container sx={{ my: 3, maxWidth: null }}>
          <Grid item md={12}>
            <Grid component={Container} container sx={{ my: 3 }}>
              <Grid item md={6}>
                <Box>
                  <NextImage
                    className="animation"
                    src="/bridge-diagram.svg"
                    width={258}
                    height={258}
                    alt="Syscoin Bridge Diagram"
                    style={{
                      width: "100%",
                      height: "auto",
                    }}
                  />
                </Box>
              </Grid>
              <Grid item md={6} sx={{ my: "auto", padding: 2 }}>
                <Typography variant="h2" fontWeight="bold">
                  SYSCOIN BRIDGE
                </Typography>
                <Typography variant="h6" sx={{ mb: 4 }}>
                  Transfer SYS back and forth between the Syscoin and NEVM
                  Blockchain
                </Typography>
                {isPaliVersion2 ? <PaliV2Bridge /> : <PaliAndMetamaskBridge />}
                {isPaliVersion2 && <BridgeMetamaskNevmInstructions />}
              </Grid>
            </Grid>
          </Grid>
        </Grid>

        <Container>
          <HomeHowItWorks />
        </Container>
        <Box component={FAQ} mb={3} />
        <Box component={ContactUs} mb={3} />
        {commitHash && repoUrl && (
          <Container sx={{ mt: 2, mb: 2 }}>
            <Typography variant="caption" color="text.secondary">
              Build: {" "}
              <Link
                href={`${repoUrl.replace(/\/$/, "")}/commit/${commitHash}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {shortHash}
              </Link>
            </Typography>
          </Container>
        )}
      </Box>

      <Footer />
    </Box>
  );
};

export default Home;
