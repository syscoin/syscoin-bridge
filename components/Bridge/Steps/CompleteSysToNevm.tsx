import { ITransfer } from "@contexts/Transfer/types";
import { useConstants } from "@contexts/useConstants";
import { Alert, Box, Typography, Link } from "@mui/material";

import React from "react";

type Props = {
  transfer: ITransfer;
};

const BridgeCompleteSysToNevm: React.FC<Props> = ({ transfer }) => {
  const { constants } = useConstants();
  const SYSCOIN_TX_BLOCKCHAIN_URL = `${constants?.explorer.utxo}/tx/`;
  const NEVM_TX_BLOCKCHAIN_URL = `${constants?.explorer.nevm}/tx/`;
  const { logs } = transfer;
  const burnSysTx =
    transfer.useSysx || transfer.utxoAssetType === "sysx"
      ? undefined
      : logs.find(
          (log) =>
            log?.status === "burn-sys" && log.payload?.data?.tx !== undefined
        );
  const burnSysxTx = logs.find(
    (log) => log?.status === "burn-sysx" && log.payload?.data?.tx !== undefined
  );
  const submitProofsTx = logs.find(
    (log) =>
      log?.status === "submit-proofs" && log.payload?.data?.hash !== undefined
  );
  return (
    <Box>
      <Alert severity="success" sx={{ mb: 3 }}>
        Transfer complete!
      </Alert>

      <Box sx={{ mb: 2 }}>
        <Typography variant="body2">SYS burn transaction:</Typography>
        {burnSysTx ? (
          <Link
            href={`${SYSCOIN_TX_BLOCKCHAIN_URL}${burnSysTx?.payload.data.tx}`}
            target="_blank"
          >
            {burnSysTx?.payload.data.tx}
          </Link>
        ) : (
          <Typography variant="body2" color="secondary.main">
            Skipped
          </Typography>
        )}
      </Box>

      <Box sx={{ mb: 2 }}>
        <Typography variant="body2">SYSX burn transaction:</Typography>
        <Link
          href={`${SYSCOIN_TX_BLOCKCHAIN_URL}${burnSysxTx?.payload.data.tx}`}
          target="_blank"
        >
          {burnSysxTx?.payload.data.tx}
        </Link>
      </Box>
      <Box>
        <Typography variant="body2">Proof-submission transaction:</Typography>
        <Link
          href={`${NEVM_TX_BLOCKCHAIN_URL}${submitProofsTx?.payload.data.hash}`}
          target="_blank"
        >
          {submitProofsTx?.payload.data.hash}
        </Link>
      </Box>
    </Box>
  );
};

export default BridgeCompleteSysToNevm;
