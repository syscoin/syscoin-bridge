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
          Pali V2 or V3 NEVM Contract Calls are not supported yet. <br />
          Please set your default wallet to Metamask. <br />
          See instructions below.
        </Alert>
      </Box>
    );
  }

  return (
    <Box display="flex" justifyContent="space-between">
      <Link href={`/bridge/sys-to-nevm`}>
        <Button variant="contained">
          Go to PaliV2 Bridge
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
