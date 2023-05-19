import { usePaliWallet } from "@contexts/PaliWallet/usePaliWallet";
import { CircularProgress, Container, Grid, Typography } from "@mui/material";
import BlocktimeDisclaimer from "components/BlocktimeDisclaimer";
import DrawerPage from "components/DrawerPage";
import { NextPage } from "next";
import { useRouter } from "next/router";
import BridgeTransferStepper from "components/Bridge/Stepper";
import TransferProvider from "@contexts/Transfer/Provider";
import BridgeWalletSwitch from "components/Bridge/WalletSwitchV2";
import TransferTitle from "components/Bridge/Transfer/Title";
import BridgeTransferStepSwitch from "components/Bridge/Transfer/StepSwitch";
import { IPaliWalletV2Context } from "@contexts/PaliWallet/V2Provider";
import { useNEVM } from "@contexts/ConnectedWallet/NEVMProvider";
import { useCallback } from "react";

const Bridge: NextPage = () => {
  const router = useRouter();
  const { switchTo, isBitcoinBased, connectedAccount } =
    usePaliWallet() as IPaliWalletV2Context;
  const { account } = useNEVM();
  const { id } = router.query;

  const switchStep = useCallback(
    async (networkType: "bitcoin" | "ethereum") => {
      if (networkType === "bitcoin") {
        if (!isBitcoinBased) {
          switchTo("bitcoin");
        }
      } else if (networkType === "ethereum") {
        if (isBitcoinBased) {
          switchTo("ethereum");
        }
      } else {
        return Promise.reject("Invalid network type");
      }

      return new Promise<string>((resolve, reject) => {
        let isTimedOut = false;
        const timeout = setTimeout(() => {
          reject("Failed to switch");
        }, 30000);

        const interval = setInterval(() => {
          if (isTimedOut) {
            clearInterval(interval);
            reject("Failed to switch");
          }
          let resolvedAddress = undefined;
          if (networkType === "bitcoin" && isBitcoinBased && connectedAccount) {
            resolvedAddress = connectedAccount;
          } else if (networkType === "ethereum" && !isBitcoinBased && account) {
            resolvedAddress = account;
          }
          if (resolvedAddress) {
            resolve(resolvedAddress);
            clearTimeout(timeout);
            clearInterval(interval);
          }
        }, 1000);
      });
    },
    [account, connectedAccount, isBitcoinBased, switchTo]
  );

  if (!id) {
    return <CircularProgress />;
  }

  return (
    <TransferProvider id={id as string} switchStep={switchStep}>
      <DrawerPage>
        <BlocktimeDisclaimer />
        <Container sx={{ mt: 10 }}>
          <Typography variant="h5" fontWeight="bold">
            Bridge Your SYS
          </Typography>
          <Typography variant="caption" color="gray">
            Trustlessly transfer SYS back and forth between the Syscoin Base and
            Syscoin NEVM blockchains without middlemen!
          </Typography>
          <TransferTitle />
          <BridgeWalletSwitch />
          <BridgeTransferStepper />
          <Grid container>
            <Grid item xs="auto" sx={{ mx: "auto" }}>
              <BridgeTransferStepSwitch />
            </Grid>
          </Grid>
        </Container>
      </DrawerPage>
    </TransferProvider>
  );
};

export default Bridge;
