import ConnectedWalletProvider from "@contexts/ConnectedWallet/Provider";
import {
  COMMON_STATUS,
  ITransfer,
  TransferType,
} from "@contexts/Transfer/types";
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Typography,
} from "@mui/material";
import BlocktimeDisclaimer from "components/BlocktimeDisclaimer";
import TransferTitle from "components/Bridge/Transfer/Title";
import BridgeSavingIndicator from "components/Bridge/SavingIndicator";
import BridgeStepSwitch from "components/Bridge/StepSwitch";
import BridgeStepper from "components/Bridge/Stepper";
import type { ConnectValidateDraft } from "components/Bridge/Steps/ConnectValidate";
import { SyscoinProvider } from "components/Bridge/context/Syscoin";
import {
  TransferContextProvider,
  useTransfer,
} from "components/Bridge/context/TransferContext";
import { Web3Provider } from "components/Bridge/context/Web";
import { NextPage } from "next";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef } from "react";
import TableRowsIcon from "@mui/icons-material/TableRows";
import NextLink from "next/link";
import BridgeTransferSwitchTypeCard from "components/Bridge/TransferSwitchTypeCard";
import BridgeNewTransferButton from "components/Bridge/NewTransferButton";
import { toSyscoinBaseUnits } from "utils/syscoin-amount";

const getDraftAmount = (amount?: string) => {
  if (amount === undefined) return undefined;

  try {
    toSyscoinBaseUnits(amount);
    return amount;
  } catch {
    return undefined;
  }
};

const NewTransferButton = () => {
  const { transfer } = useTransfer();

  if (transfer.status !== "completed") {
    return null;
  }

  return <BridgeNewTransferButton />;
};

const createTransfer = (
  type: TransferType,
  draft: Partial<ConnectValidateDraft> = {}
): ITransfer => {
  const amount = getDraftAmount(draft.amount);

  return {
    amount: amount ?? "0",
    id: crypto.randomUUID(),
    type,
    status: COMMON_STATUS.INITIALIZE,
    logs: [],
    createdAt: Date.now(),
    version: "v2",
    agreedToTerms: false,
    nevmAddress: draft.nevmAddress || undefined,
    utxoAddress: draft.utxoAddress || undefined,
    utxoXpub: draft.utxoXpub || undefined,
    utxoAssetType: draft.utxoAssetType,
  };
};

const isDirectionRoute = (id: unknown): id is TransferType =>
  id === "sys-to-nevm" || id === "nevm-to-sys";

const BridgePage: NextPage = () => {
  const { query } = useRouter();
  const connectValidateDraft = useRef<Partial<ConnectValidateDraft>>({});

  useEffect(() => {
    if (!isDirectionRoute(query.id)) {
      connectValidateDraft.current = {};
    }
  }, [query.id]);

  const handleConnectValidateDraftChange = useCallback(
    (draft: ConnectValidateDraft) => {
      connectValidateDraft.current = {
        ...connectValidateDraft.current,
        ...draft,
      };
    },
    []
  );

  const initialTransfer = useMemo(() => {
    const id = query.id;
    if (isDirectionRoute(id)) {
      return createTransfer(id, connectValidateDraft.current);
    }
    return {
      id,
    } as ITransfer;
  }, [query.id]);

  return (
    <SyscoinProvider>
      <Web3Provider>
        <ConnectedWalletProvider>
          <TransferContextProvider transfer={initialTransfer}>
            <Container sx={{ mt: 10, mb: 15 }}>
              <BlocktimeDisclaimer />
              <Typography variant="h5" fontWeight="bold">
                Bridge Your SYS
              </Typography>
              <Typography variant="caption" color="gray">
                Move SYS between Syscoin UTXO and Syscoin NEVM using
                protocol-verified proofs.
              </Typography>
              <Box sx={{ my: 3 }}>
                <TransferTitle />
                <Button LinkComponent={NextLink} href="/transfers">
                  <TableRowsIcon />
                  View All Transfers
                </Button>
                <NewTransferButton />
              </Box>
              <BridgeStepper />
              <Box sx={{ mt: 3, mb: 2, width: "50%" }}>
                <BridgeTransferSwitchTypeCard />
              </Box>
              <Card
                sx={{
                  mt: 1,
                  display: "flex",
                  flexDirection: "column",
                  minWidth: "20rem",
                  width: "50%",
                }}
              >
                <CardContent>
                  <BridgeStepSwitch
                    onConnectValidateDraftChange={
                      handleConnectValidateDraftChange
                    }
                  />
                  <BridgeSavingIndicator />
                </CardContent>
              </Card>
            </Container>
          </TransferContextProvider>
        </ConnectedWalletProvider>
      </Web3Provider>
    </SyscoinProvider>
  );
};

export default BridgePage;
