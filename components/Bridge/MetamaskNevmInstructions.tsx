import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  List,
  ListItem,
  Typography,
} from "@mui/material";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import Image from "next/image";

const BridgeMetamaskNevmInstructions = () => {
  return (
    <Box sx={{ mt: 4 }}>
      <Accordion>
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          aria-controls="panel1a-content"
          id="panel1a-header"
        >
          <Image
            src="/metamask-logo.svg"
            height={24}
            width={24}
            alt="MetaMask logo"
          />{" "}
          <Typography>Use MetaMask for Syscoin NEVM</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <List>
            <ListItem>
              <Typography>1. Open Pali Wallet.</Typography>
            </ListItem>
            <ListItem>
              <Typography>
                2. Open the options menu in the upper-right corner.
              </Typography>
            </ListItem>
            <ListItem>
              <Typography>3. Select Default wallet.</Typography>
            </ListItem>
            <ListItem>
              <Typography>4. Choose MetaMask.</Typography>
            </ListItem>
            <ListItem>
              <Typography>5. Reload this page.</Typography>
            </ListItem>
          </List>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
};

export default BridgeMetamaskNevmInstructions;
