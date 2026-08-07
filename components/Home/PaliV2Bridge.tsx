import { Alert, Box, Button } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

import Link from "next/link";
import { useFeatureFlags } from "components/Bridge/hooks/useFeatureFlags";

export const PaliV2Bridge = () => {
  const { isEnabled } = useFeatureFlags();

  const isPaliV2NevmEnabled = isEnabled("isPaliV2NevmEnabled");

  if (!isPaliV2NevmEnabled) {
    return (
      <Box display="flex" justifyContent="space-between">
        <Alert severity="warning">
          This Pali Wallet version does not support NEVM contract calls. Set
          MetaMask as your default wallet, then follow the instructions below.
        </Alert>
      </Box>
    );
  }

  return (
    <Box display="flex" justifyContent="space-between">
      <Link href={`/bridge/sys-to-nevm`}>
        <Button variant="contained">
          Start Bridge Transfer
          <ArrowForwardIcon />
        </Button>
      </Link>
      <Link href={`/transfers`}>
        <Button variant="text" color="secondary">
          View My Transfers
        </Button>
      </Link>
    </Box>
  );
};

export default PaliV2Bridge;
