import ConnectedWalletProvider from "@contexts/ConnectedWallet/Provider";
import {
  COMMON_STATUS,
  ETH_TO_SYS_TRANSFER_STATUS,
  ITransfer,
  SYS_TO_ETH_TRANSFER_STATUS,
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
import {
  clearConnectValidateDraft,
  type ConnectValidateDraft,
  readConnectValidateDraft,
  writeConnectValidateDraft,
} from "components/Bridge/connect-validate-draft";
import { SyscoinProvider } from "components/Bridge/context/Syscoin";
import {
  TransferContextProvider,
  useTransfer,
} from "components/Bridge/context/TransferContext";
import { Web3Provider } from "components/Bridge/context/Web";
import { NextPage } from "next";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TableRowsIcon from "@mui/icons-material/TableRows";
import NextLink from "next/link";
import BridgeTransferSwitchTypeCard from "components/Bridge/TransferSwitchTypeCard";
import BridgeNewTransferButton from "components/Bridge/NewTransferButton";
import BridgeLoading from "components/Bridge/Loading";
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

const signingStatuses = new Set<ITransfer["status"]>([
  SYS_TO_ETH_TRANSFER_STATUS.BURN_SYS,
  SYS_TO_ETH_TRANSFER_STATUS.BURN_SYSX,
  SYS_TO_ETH_TRANSFER_STATUS.SUBMIT_PROOFS,
  ETH_TO_SYS_TRANSFER_STATUS.FREEZE_BURN_SYS,
  ETH_TO_SYS_TRANSFER_STATUS.MINT_SYSX,
]);

const TransferDestination = () => {
  const { transfer } = useTransfer();
  if (!signingStatuses.has(transfer.status)) return null;

  const toNevm = transfer.type === "sys-to-nevm";
  const destination = toNevm ? transfer.nevmAddress : transfer.utxoAddress;
  if (!destination) return null;

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="caption">
        {toNevm ? "Syscoin NEVM destination" : "Syscoin UTXO destination"}
      </Typography>
      <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
        {destination}
      </Typography>
    </Box>
  );
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

const getSessionStorage = () => {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
};

const BridgePage: NextPage = () => {
  const { isReady, query } = useRouter();
  const connectValidateDraft = useRef<Partial<ConnectValidateDraft>>({});
  const [isDraftHydrated, setIsDraftHydrated] = useState(false);

  useEffect(() => {
    if (!isReady) return;

    const storage = getSessionStorage();
    if (isDirectionRoute(query.id)) {
      connectValidateDraft.current = storage
        ? readConnectValidateDraft(storage)
        : {};
    } else {
      connectValidateDraft.current = {};
      if (storage) clearConnectValidateDraft(storage);
    }
    setIsDraftHydrated(true);
  }, [isReady, query.id]);

  const handleConnectValidateDraftChange = useCallback(
    (draft: ConnectValidateDraft) => {
      const nextDraft = {
        ...connectValidateDraft.current,
        ...draft,
      };
      connectValidateDraft.current = nextDraft;
      const storage = getSessionStorage();
      if (storage) writeConnectValidateDraft(storage, nextDraft);
    },
    []
  );

  const initialTransfer = useMemo(() => {
    const id = query.id;
    if (isDirectionRoute(id)) {
      return createTransfer(
        id,
        isDraftHydrated ? connectValidateDraft.current : {}
      );
    }
    return {
      id,
    } as ITransfer;
  }, [isDraftHydrated, query.id]);

  const isLoadingDraft = isDirectionRoute(query.id) && !isDraftHydrated;

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
                  {isLoadingDraft ? (
                    <BridgeLoading />
                  ) : (
                    <>
                      <TransferDestination />
                      <BridgeStepSwitch
                        onConnectValidateDraftChange={
                          handleConnectValidateDraftChange
                        }
                      />
                    </>
                  )}
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
