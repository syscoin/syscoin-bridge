import { ITransfer } from "@contexts/Transfer/types";
import {
  Box,
  Step,
  StepContent,
  StepLabel,
  Stepper,
  Typography,
} from "@mui/material";
import { BridgeV3Layout } from "components/Bridge/v3/Layout";
import BridgeV3StepBurnSys from "components/Bridge/v3/Steps/BurnSys";
import { TransferContextProvider } from "components/Bridge/v3/context/TransferContext";
import {
  GetServerSideProps,
  InferGetServerSidePropsType,
  NextPage,
} from "next";

import { getTransfer } from "services/transfer";
import isTransfer from "utils/isTransfer";

export const getServerSideProps: GetServerSideProps<{
  transfer: ITransfer;
}> = async (context) => {
  const { id } = context.query;
  try {
    const transfer = await getTransfer(id as string);
    if (!isTransfer(transfer)) {
      throw new Error("Invalid transfer");
    }
    return {
      props: {
        transfer,
      },
    };
  } catch (e) {
    console.log(e);
    return {
      notFound: true,
    };
  }
};

const BridgeV3Page: NextPage<
  InferGetServerSidePropsType<typeof getServerSideProps>
> = ({ transfer }) => {
  return (
    <TransferContextProvider transfer={transfer}>
      <BridgeV3Layout>
        <Box
          sx={{
            flex: 3,
            borderRight: "1px solid",
            borderColor: "primary",
            display: "flex",
          }}
        >
          <Stepper
            activeStep={0}
            orientation="vertical"
            sx={{ mx: "auto", minWidth: "20rem" }}
          >
            <Step key="Burn SYS">
              <StepLabel>
                <Typography>Burn Sys</Typography>
              </StepLabel>
              <StepContent>
                <BridgeV3StepBurnSys />
              </StepContent>
            </Step>
            <Step key="Burn SYSX">
              <StepLabel>
                <Typography>Burn SYSX</Typography>
              </StepLabel>
              <StepContent>
                <Typography>Burn Sys</Typography>
              </StepContent>
            </Step>
            <Step key="Generate Proofs">
              <StepLabel>
                <Typography>Generate Proofs</Typography>
              </StepLabel>
              <StepContent>
                <Typography>Burn Sys</Typography>
              </StepContent>
            </Step>
            <Step key="Switch">
              <StepLabel>
                <Typography>Switch</Typography>
              </StepLabel>
              <StepContent>
                <Typography>Switch</Typography>
              </StepContent>
            </Step>
            <Step key="Submit Proofs">
              <StepLabel>
                <Typography>Submit Proofs</Typography>
              </StepLabel>
              <StepContent>
                <Typography>Burn Sys</Typography>
              </StepContent>
            </Step>
            <Step key="Completed">
              <StepLabel>
                <Typography>Completed</Typography>
              </StepLabel>
              <StepContent>
                <Typography>Burn Sys</Typography>
              </StepContent>
            </Step>
          </Stepper>
        </Box>
        <Box sx={{ flex: 1, p: 2 }}>
          <Typography>Transfer #{transfer.id}</Typography>
        </Box>
      </BridgeV3Layout>
    </TransferContextProvider>
  );
};

export default BridgeV3Page;
