import React, {
  FC,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { NextPage } from "next";
import {
  Box,
  Grid,
  Container,
  Card,
  CardContent,
  Typography,
  ButtonBase,
  Button,
  Backdrop,
  CircularProgress,
} from "@mui/material";
import Head from "next/head";
import { useRouter } from "next/router";
import { DepositPart } from "./_deposit";
import { WithdrawPart } from "./_withdraw";
import { useMetamask } from "@contexts/Metamask/Provider";
import { useConnectedWallet } from "@contexts/ConnectedWallet/useConnectedWallet";
import { ConnectWalletBox } from "./_connectWallet";
import { Web3Ethers, useEthers } from "@usedapp/core";
import {
  CrossChainMessenger,
  ETHBridgeAdapter,
  MessageStatus,
} from "@eth-optimism/sdk";
import { BigNumber, ethers } from "ethers";
import {
  networks,
  getNetworkByChainId,
  NetworkData,
  networksMap,
  getNetworkByName,
} from "blockchain/NevmRolluxBridge/config/networks";
import { crossChainMessengerFactory } from "blockchain/NevmRolluxBridge/factories/CrossChainMessengerFactory";

type BridgeNevmRolluxProps = {};

enum CurrentDisplayView {
  deposit,
  withdraw,
}

export const BridgeNevmRollux: NextPage<BridgeNevmRolluxProps> = ({}) => {
  const [currentDisplay, setCurrentDisplay] = useState<CurrentDisplayView>(
    CurrentDisplayView.deposit
  );
  const connectedWalletCtxt = useConnectedWallet();
  const isConnected = connectedWalletCtxt.nevm.account;
  const { account, activateBrowserWallet, library } = useEthers();
  const [crossChainMessenger, setCrossChainMessenger] = useState<
    CrossChainMessenger | undefined
  >(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const getCrossChainMessenger = async (library: any) => {
    if (!library) {
      console.warn("No library");
      return undefined;
    }

    const w3Provider = library as ethers.providers.JsonRpcProvider;
    const currentChainId: number = await w3Provider.getSigner().getChainId();

    const network: NetworkData | undefined = getNetworkByChainId(
      currentChainId,
      networks
    );

    if (!network) {
      console.warn("Can not detect network");
      return undefined;
    }

    const netMap = networksMap[network.name] ?? undefined;
    console.log(network.name);

    if (!netMap) {
      console.warn("Cant not find net mapping");

      return undefined;
    }

    const secondNetwork: NetworkData | undefined = getNetworkByName(
      netMap,
      networks
    );

    if (!secondNetwork) {
      console.warn("Failed to fetch second network by name");
      return undefined;
    }

    return crossChainMessengerFactory(
      network,
      secondNetwork,
      w3Provider.getSigner(),
      new ethers.providers.JsonRpcProvider(secondNetwork?.rpcAddress),
      true
    );
  };

  const handleERC20Approval = async (
    l1Token: string,
    l2Token: string,
    amount: BigNumber
  ) => {
    if (!library) {
      console.warn("approval:no-library");
      return; // not connected wallet
    }

    if (!crossChainMessenger) {
      console.warn("approval:no-messenger");
      return; // no messenger initialized
    }

    try {
      await crossChainMessenger.approveERC20(l1Token, l2Token, amount);

      setIsLoading(false);
    } catch (e) {
      console.log(e);
      setIsLoading(false);
    }
  };

  const handleERC20Deposit = async (
    l1Token: string,
    l2Token: string,
    amount: BigNumber
  ) => {
    if (!library || !crossChainMessenger) {
      return; // not connected or not initialized
    }

    try {
      const tx = await crossChainMessenger.depositERC20(
        l1Token,
        l2Token,
        amount
      );
      await tx.wait();

      await crossChainMessenger.waitForMessageStatus(
        tx.hash,
        MessageStatus.RELAYED
      );

      setIsLoading(false);
    } catch (e) {
      setIsLoading(false);
      console.log(e);
    }

    // if success
  };

  const handleDepositMainCurrency = async (amount: string) => {
    if (!library) {
      return;
    }

    if (crossChainMessenger) {
      try {
        const depositTx = await crossChainMessenger.depositETH(
          ethers.utils.parseEther(amount)
        );

        const confirmation = await crossChainMessenger.waitForMessageReceipt(
          depositTx
        );

        if (confirmation.receiptStatus === 1) {
          console.log("OK");

          setIsLoading(false);
        } else {
          console.log("Error");
          console.log(confirmation);
          setIsLoading(false);
        }
      } catch (e) {
        setIsLoading(false);
        console.log(e);
      }
    }
  };

  const switchAction = (action: CurrentDisplayView) => {
    setCurrentDisplay(action);
  };

  /**!SECTION
   *
   * Hack for use useDapp
   *
   * todo : refactor whole app to useDapp instead of web3-react
   */
  useEffect(() => {
    if (!account && connectedWalletCtxt.nevm.account) {
      activateBrowserWallet();
    }
  }, [account, activateBrowserWallet, connectedWalletCtxt.nevm.account]);

  useEffect(() => {
    getCrossChainMessenger(library).then((messenger) => {
      setCrossChainMessenger(messenger);
    });
  }, [library]);

  return (
    <Box>
      <Head>
        <title>Syscoin Bridge | Rollux & NEVM </title>
        <link rel="shortcut icon" href="/favicon.ico" />
        <meta name="description" content="Syscoin Trustless Bridge" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <Grid container spacing={2} component={Container} sx={{ mt: 2 }}>
        <Grid item xs={12}>
          <Typography variant="h6">
            Swap your SYS between NEVM and Rollux.
          </Typography>
        </Grid>
        <Grid item xs={12}>
          <Card variant="outlined">
            <CardContent>
              <Box
                display="flex"
                sx={{
                  padding: "4px",
                  border: "1px solid #b7c5e2",
                  borderRadius: "4px",
                  background: "#cddbf8",
                }}
              >
                <Button
                  variant={
                    currentDisplay === CurrentDisplayView.deposit
                      ? "contained"
                      : "text"
                  }
                  sx={{ flex: 1 }}
                  onClick={() => switchAction(CurrentDisplayView.deposit)}
                >
                  Deposit
                </Button>
                <Button
                  variant={
                    currentDisplay === CurrentDisplayView.withdraw
                      ? "contained"
                      : "text"
                  }
                  sx={{ flex: 1 }}
                  onClick={() => switchAction(CurrentDisplayView.withdraw)}
                >
                  Withdraw
                </Button>
              </Box>
              <Box sx={{ mt: 2 }}>
                {isConnected &&
                  currentDisplay === CurrentDisplayView.deposit && (
                    <DepositPart
                      onClickDepositButton={(
                        amount: string,
                        tokenAddress: string | undefined
                      ) => {
                        if (!tokenAddress) {
                          handleDepositMainCurrency(amount);
                        }
                      }}
                      onClickApproveERC20={(
                        l1Token: string,
                        l2Token: string,
                        amount: BigNumber
                      ) => {
                        handleERC20Approval(l1Token, l2Token, amount);
                      }}
                      onClickDepositERC20={(
                        l1Token: string,
                        l2Token: string,
                        amount: BigNumber
                      ) => {
                        handleERC20Deposit(l1Token, l2Token, amount);
                      }}
                      setIsLoading={setIsLoading}
                      L1StandardBridgeAddress="0x77Cdc3891C91729dc9fdea7000ef78ea331cb34A"
                    />
                  )}

                {isConnected &&
                  currentDisplay === CurrentDisplayView.withdraw && (
                    <WithdrawPart
                      onClickApproveERC20={(l1Token, l2Token, amount) => {}}
                      onClickWithdrawButton={(amount, address) => {}}
                      onClickWithdrawERC20={(l1Token, l2Token, amount) => {}}
                      setIsLoading={setIsLoading}
                      L1StandardBridgeAddress="0x77Cdc3891C91729dc9fdea7000ef78ea331cb34A"
                    />
                  )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Backdrop
        sx={{ color: "#fff", zIndex: (theme) => theme.zIndex.drawer + 1 }}
        open={isLoading}
        onClick={() => {
          // handle nothing . Wait for tx ends or results.
        }}
      >
        <CircularProgress color="inherit" />
      </Backdrop>

      {!isConnected && (
        <>
          <ConnectWalletBox />
        </>
      )}
    </Box>
  );
};

export default BridgeNevmRollux;
