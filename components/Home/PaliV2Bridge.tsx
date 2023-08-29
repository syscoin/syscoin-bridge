import { Box, Button } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

import Link from "next/link";

export const PaliV2Bridge = () => {
  return (
    <>
      <Box display="flex" justifyContent="space-between">
        <Link href={`/bridge/v3/sys-to-nevm`}>
          <Button variant="contained">
            Go to PaliV2 Bridge
            <ArrowForwardIcon />
          </Button>
        </Link>
        <Link href={`/transfers/v2`}>
          <Button variant="text" color="secondary">
            View My Transfers
          </Button>
        </Link>
      </Box>
    </>
  );
};

export default PaliV2Bridge;
