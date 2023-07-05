import { Box, Button, Step, Typography } from "@mui/material";

const BridgeV3StepBurnSys: React.FC = () => {
  return (
    <Box>
      <Typography>Burning 10,000.0123 SYS</Typography>
      <Button color="error">Cancel</Button>
      <Button color="primary" variant="contained">
        Confirm
      </Button>
    </Box>
  );
};

export default BridgeV3StepBurnSys;
