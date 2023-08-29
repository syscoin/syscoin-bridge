import { Box, Button, Typography } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

import Link from "next/link";

import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";

import Web3 from "web3";
import { useConnectedWallet } from "@contexts/ConnectedWallet/useConnectedWallet";
import WalletList from "components/WalletList";

export const PaliAndMetamaskBridge = () => {
  const { nevm, utxo } = useConnectedWallet();
  const { isEVMInjected } = usePaliWalletV2();

  const isInvalidSyscoinAddress =
    !utxo.account || (!isEVMInjected && Web3.utils.isAddress(utxo.account));

  const isReady = Boolean(nevm.account) && Boolean(utxo.account);

  return (
    <>
      <WalletList />
      {isReady && (
        <Box display="flex" justifyContent="space-between">
          <Link href={`/bridge/v3/sys-to-nevm`}>
            <Button variant="contained" disabled={isInvalidSyscoinAddress}>
              Continue
              <ArrowForwardIcon />
            </Button>
            {isInvalidSyscoinAddress && (
              <Typography
                variant="caption"
                color="error"
                sx={{ ml: "auto", display: "block" }}
              >
                Invalid Address. Please switch to UTXO Network
              </Typography>
            )}
          </Link>
          <Link href={`/transfers/v2`}>
            <Button variant="text" color="secondary">
              View My Transfers
            </Button>
          </Link>
        </Box>
      )}
    </>
  );
};

export default PaliAndMetamaskBridge;
