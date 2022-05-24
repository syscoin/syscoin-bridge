import { ThemeProvider } from "@emotion/react";
import { Box, Button, Container, Grid, Typography } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import type { NextPage } from "next";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";

import WalletList from "../components/WalletList";
import { useConnectedWallet } from "../contexts/ConnectedWallet/useConnectedWallet";

const Home: NextPage = () => {
  const { nevm, utxo } = useConnectedWallet();

  const isReady = nevm.account && utxo.account;

  return (
    <Box>
      <Head>
        <title>Syscoin Bridge</title>
        <link rel="shortcut icon" href="/favicon.ico" />
        <meta name="description" content="Syscoin Trustless Bridge" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <Box component="main">
        <Grid component={Container} container sx={{ my: 3 }}>
          <Grid item md={6}>
            <Box>
              <Image
                width={"720px"}
                layout="intrinsic"
                height={"720px"}
                alt="bridge animation"
                src="/bridge-diagram.svg"
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
            <WalletList />
            {isReady && (
              <Link href={`/bridge/${Date.now()}`}>
                <Button variant="contained">
                  Continue
                  <ArrowForwardIcon />
                </Button>
              </Link>
            )}
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
};

export default Home;
