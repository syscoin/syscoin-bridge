import { Alert, Box, Button, Typography } from "@mui/material";
import { useTransfer } from "../context/TransferContext";
import {
  ITransferLog,
  SYS_TO_ETH_TRANSFER_STATUS,
  TransferStatus,
} from "@contexts/Transfer/types";
import { isSpvProof, useSubmitProof } from "../hooks/useSubmitProof";
import NEVMStepWrapper from "../NEVMStepWrapepr";
import useSyscoinSubmitProofs from "../hooks/useSyscoinSubmitProofs";
import { useFeatureFlags } from "../hooks/useFeatureFlags";

type Props = {
  successStatus: TransferStatus;
};

const SubmitProofs: React.FC<Props> = ({ successStatus }) => {
  const { transfer, saveTransfer } = useTransfer();
  const { isEnabled } = useFeatureFlags();
  const burnSysLog = transfer.logs.find(
    (log) => log.status === "generate-proofs" && Boolean(log.payload?.data)
  );

  const spvProof = burnSysLog?.payload?.data;

  const onSuccess = (data: unknown) => {
    const updatedLogs: ITransferLog[] = [
      ...transfer.logs,
      {
        date: Date.now(),
        payload: {
          data: {
            hash: data,
          },
          message: "submit-proofs",
          previousStatus: SYS_TO_ETH_TRANSFER_STATUS.GENERATE_PROOFS,
        },
        status: SYS_TO_ETH_TRANSFER_STATUS.SUBMIT_PROOFS,
      },
    ];

    saveTransfer({
      ...transfer,
      logs: updatedLogs,
      status: successStatus,
    });
  };

  const foundation = useSyscoinSubmitProofs(transfer, onSuccess);
  const self = useSubmitProof(transfer, spvProof);

  const foundationFundingAvailable = isEnabled("foundationFundingAvailable");

  const {
    mutate: submitProofs,
    isLoading: isSigning,
    isError: isSignError,
    error: signError,
  } = foundationFundingAvailable ? foundation : self;

  const sign = () => {
    submitProofs(undefined, { onSuccess });
  };

  if (!spvProof || !isSpvProof(spvProof)) {
    return <Alert severity="error">Generated proof data is missing.</Alert>;
  }

  if (isSigning) {
    return (
      <Alert severity="info">
        {foundationFundingAvailable
          ? "Submitting proof..."
          : "Confirm the transaction in your NEVM wallet."}
      </Alert>
    );
  }

  if (isSignError) {
    let errorMessage =
      typeof signError === "string" ? signError : JSON.stringify(signError);

    if (signError instanceof Error) {
      errorMessage = signError.message;
    }
    return (
      <Alert severity="error" action={<Button onClick={sign}>Retry</Button>}>
        Proof submission failed: {errorMessage}
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="caption" sx={{ mb: 1 }}>
        NEVM Block Hash
      </Typography>
      <Typography variant="body1" sx={{ mb: 2, overflowWrap: "anywhere" }}>
        {spvProof.nevm_blockhash}
      </Typography>
      <Typography variant="caption" sx={{ mb: 1 }}>
        UTXO Block Hash
      </Typography>
      <Typography variant="body1" sx={{ mb: 2, overflowWrap: "anywhere" }}>
        {spvProof.blockhash}
      </Typography>
      <Button color="primary" variant="contained" onClick={sign}>
        Submit Proof
      </Button>
    </Box>
  );
};

const BridgeStepSubmitProofs: React.FC<Props> = (props) => {
  return (
    <NEVMStepWrapper>
      <SubmitProofs {...props} />
    </NEVMStepWrapper>
  );
};

export default BridgeStepSubmitProofs;
