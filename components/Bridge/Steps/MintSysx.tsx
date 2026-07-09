import { Alert, Box, Button, CircularProgress, Typography } from "@mui/material";
import UTXOStepWrapper from "../UTXOStepWrapper";
import { useTransfer } from "../context/TransferContext";
import {
  COMMON_STATUS,
  ETH_TO_SYS_TRANSFER_STATUS,
  ITransferLog,
  TransferStatus,
} from "@contexts/Transfer/types";

import { useMintSysx } from "../hooks/useMintSysx";
import { TransactionReceipt } from "web3-core";
import { useEffect } from "react";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import { useSponsorClaimGas } from "../hooks/useSponsorClaimGas";
import { useUtxoTransaction } from "../hooks/useUtxoTransaction";

const isError = (error: unknown): error is Error => {
  return error instanceof Error;
};

type Props = {
  successStatus: TransferStatus;
};

const MintSysx: React.FC<Props> = ({ successStatus }) => {
  const { transfer, saveTransfer } = useTransfer();
  const { isEnabled } = useFeatureFlags();

  const freezeBurnConfirmationLog = transfer.logs.find(
    (log) => log.status === "confirm-freeze-burn-sys"
  );

  const transactionReceipt: TransactionReceipt | undefined =
    freezeBurnConfirmationLog?.payload.data;

  const {
    mutate: mintSysx,
    isLoading: isSigning,
    isError: isSignError,
    error: signError,
  } = useMintSysx(transfer);
  const {
    mutate: sponsorClaimGas,
    data: sponsorClaimGasData,
    isLoading: isSponsorClaimGasLoading,
    isSuccess: isSponsorClaimGasSuccess,
    isError: isSponsorClaimGasError,
    error: sponsorClaimGasError,
  } = useSponsorClaimGas(transfer);

  const claimGasSponsorshipAvailable =
    isEnabled("foundationFundingAvailable") && transfer.type === "nevm-to-sys";
  const sponsorClaimGasLog = transfer.logs.find(
    (log) =>
      log.status === COMMON_STATUS.SPONSOR_CLAIM_GAS &&
      Boolean(log.payload?.data?.tx)
  );
  const sponsorClaimGasTxId =
    sponsorClaimGasLog?.payload?.data?.tx ??
    (sponsorClaimGasData?.funded ? sponsorClaimGasData.txid : undefined);
  const sponsorClaimGasTransaction = useUtxoTransaction(
    sponsorClaimGasTxId,
    0
  );
  const isClaimGasReady =
    !claimGasSponsorshipAvailable ||
    sponsorClaimGasData?.funded === false ||
    Boolean(sponsorClaimGasTxId && sponsorClaimGasTransaction.data);

  useEffect(() => {
    if (
      !claimGasSponsorshipAvailable ||
      !transactionReceipt ||
      sponsorClaimGasLog ||
      isSponsorClaimGasLoading ||
      isSponsorClaimGasSuccess ||
      isSponsorClaimGasError
    ) {
      return;
    }

    sponsorClaimGas(undefined, {
      onSuccess: (data) => {
        if (!data.funded || !data.txid) {
          return;
        }

        const updatedLogs: ITransferLog[] = [
          ...transfer.logs,
          {
            date: Date.now(),
            payload: {
              data: {
                tx: data.txid,
                amountSats: data.amountSats,
                balanceSats: data.balanceSats,
              },
              message: "Sponsor UTXO claim gas",
            },
            status: COMMON_STATUS.SPONSOR_CLAIM_GAS,
          },
        ];

        saveTransfer({
          ...transfer,
          logs: updatedLogs,
        });
      },
    });
  }, [
    claimGasSponsorshipAvailable,
    isSponsorClaimGasError,
    isSponsorClaimGasLoading,
    isSponsorClaimGasSuccess,
    saveTransfer,
    sponsorClaimGas,
    sponsorClaimGasLog,
    transactionReceipt,
    transfer,
  ]);

  if (!transactionReceipt) {
    return (
      <Alert severity="error">
        Invalid State: Freeze and Burn logs was not saved
      </Alert>
    );
  }

  if (claimGasSponsorshipAvailable && !isClaimGasReady) {
    if (isSponsorClaimGasError) {
      const errorMessage =
        sponsorClaimGasError instanceof Error
          ? sponsorClaimGasError.message
          : JSON.stringify(sponsorClaimGasError);

      return (
        <Alert
          severity="error"
          action={<Button onClick={() => sponsorClaimGas()}>Retry</Button>}
        >
          Sponsor claim gas error: {errorMessage}
        </Alert>
      );
    }

    if (sponsorClaimGasData?.funded && !sponsorClaimGasTxId) {
      return (
        <Alert
          severity="info"
          action={<Button onClick={() => sponsorClaimGas()}>Check Again</Button>}
        >
          UTXO claim gas sponsorship is already in progress.
        </Alert>
      );
    }

    return (
      <Alert severity="info">
        {sponsorClaimGasTxId
          ? "Waiting for sponsored claim gas funding..."
          : "Funding destination claim gas..."}{" "}
        <CircularProgress size={"1rem"} />
      </Alert>
    );
  }

  const onSignatureSuccess = (tx: string) => {
    const updatedLogs: ITransferLog[] = [
      ...transfer.logs,
      {
        date: Date.now(),
        payload: {
          data: {
            tx,
          },
          message: "Mint SYSX",
        },
        status: ETH_TO_SYS_TRANSFER_STATUS.MINT_SYSX,
      },
    ];
    saveTransfer({
      ...transfer,
      logs: updatedLogs,
      status: successStatus,
    });
  };

  const onSignatureError = (error: unknown) => {
    const updatedLogs: ITransferLog[] = [
      ...transfer.logs,
      {
        date: Date.now(),
        payload: {
          data: {
            error,
          },
          message: "Mint SYSX",
        },
        status: ETH_TO_SYS_TRANSFER_STATUS.MINT_SYSX,
      },
    ];
    saveTransfer({
      ...transfer,
      logs: updatedLogs,
    });
  };

  const sign = () => {
    if (!transactionReceipt) {
      return;
    }
    mintSysx(transactionReceipt.transactionHash, {
      onSuccess: onSignatureSuccess,
      onError: onSignatureError,
    });
  };

  if (isSigning) {
    return <Alert severity="info">Check Pali Wallet for signing</Alert>;
  }

  if (isSignError) {
    let errorMessage =
      typeof signError === "string" ? signError : JSON.stringify(signError);

    if (isError(signError)) {
      errorMessage = signError.message;
    }
    return (
      <Alert severity="error" action={<Button onClick={sign}>Retry</Button>}>
        Mint SYSX error: {errorMessage}
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="body2" sx={{ mb: 1 }}>
        Confirm Mint of SYSX:
      </Typography>
      <Typography variant="h6" sx={{ mb: 2 }}>
        {transfer.amount} SYSX
      </Typography>
      <Button color="primary" variant="contained" onClick={sign}>
        Confirm
      </Button>
    </Box>
  );
};

const BridgeStepMintSysx: React.FC<Props> = (props) => (
  <UTXOStepWrapper>
    <MintSysx {...props} />
  </UTXOStepWrapper>
);

export default BridgeStepMintSysx;
