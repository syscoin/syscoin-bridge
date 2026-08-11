import { ADMIN_LOGIN_MESSAGE } from "@constants";
import { useNEVM } from "@contexts/ConnectedWallet/NEVMProvider";
import { useConstants } from "@contexts/useConstants";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import ConnectAdmin from "components/Admin/ConnectAdmin";
import { GetServerSideProps, NextPage } from "next";
import { useRouter } from "next/router";
import { useState } from "react";

type Props = {
  loginMessage: string;
};

export const AdminLoginPage: NextPage<Props> = ({ loginMessage }) => {
  const {
    account,
    chainId,
    expectedChainId,
    isExpectedChain,
    isWrongChain,
    signMessage,
  } = useNEVM();
  const { constants } = useConstants();
  const { replace } = useRouter();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string>();
  const networkName = constants?.isTestnet
    ? "Tanenbaum NEVM"
    : "Syscoin NEVM Mainnet";

  const onLogin = async () => {
    if (!account) {
      setError("Connect the NEVM wallet registered for this admin portal.");
      return;
    }
    if (!isExpectedChain) {
      setError(`Switch your wallet to ${networkName} before signing in.`);
      return;
    }

    setError(undefined);
    setIsLoggingIn(true);
    try {
      const adminResponse = await fetch(
        `/api/admin?address=${encodeURIComponent(account)}`
      );
      if (adminResponse.status === 404) {
        throw new Error(
          `This wallet is not registered for the ${networkName} admin portal.`
        );
      }
      if (!adminResponse.ok) {
        throw new Error("Unable to verify administrator access.");
      }

      const signedMessage = await signMessage(loginMessage);
      const response = await fetch("/api/admin/login", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: account, signedMessage }),
        method: "POST",
        credentials: "include",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.message || "Administrator sign-in failed.");
      }
      await replace("/admin");
    } catch (loginError) {
      if ((loginError as { code?: number })?.code === 4001) {
        setError("The wallet signature request was cancelled.");
      } else {
        setError(
          loginError instanceof Error
            ? loginError.message
            : "Administrator sign-in failed."
        );
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <Container
      maxWidth="sm"
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        py: 4,
      }}
    >
      <Paper elevation={3} sx={{ width: "100%", p: { xs: 3, sm: 4 } }}>
        <Stack spacing={3}>
          <Box>
            <Typography component="h1" variant="h4" gutterBottom>
              Bridge administration
            </Typography>
            <Typography color="text.secondary">
              Connect a registered administrator wallet on {networkName}, then
              sign the login message. Signing is free and does not submit a
              transaction.
            </Typography>
          </Box>

          {account && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                Connected wallet
              </Typography>
              <Typography sx={{ overflowWrap: "anywhere" }}>
                {account}
              </Typography>
            </Box>
          )}

          {isWrongChain && (
            <Alert severity="warning">
              Wrong network. Connected to chain {chainId}; this portal requires
              {` ${expectedChainId}`}.
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}

          <ConnectAdmin />

          {account && (
            <Button
              size="large"
              variant="contained"
              disabled={isLoggingIn || !isExpectedChain}
              onClick={onLogin}
              startIcon={
                isLoggingIn ? <CircularProgress size={18} /> : undefined
              }
            >
              {isLoggingIn ? "Signing in…" : "Sign in"}
            </Button>
          )}
        </Stack>
      </Paper>
    </Container>
  );
};

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    props: {
      loginMessage: `0x${Buffer.from(ADMIN_LOGIN_MESSAGE, "utf8").toString(
        "hex"
      )}`,
    },
  };
};

export default AdminLoginPage;
