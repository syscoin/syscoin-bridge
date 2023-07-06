import { Box, Button, Typography } from "@mui/material";
import UTXOStepWrapper from "../UTXOStepWrapper";

const BurnSys: React.FC = () => {
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

const BridgeV3StepBurnSys = () => (
  <UTXOStepWrapper>
    <BurnSys />
  </UTXOStepWrapper>
);

export default BridgeV3StepBurnSys;
