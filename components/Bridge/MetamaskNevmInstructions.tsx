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
            alt="Metamask logo"
          />{" "}
          <Typography>Want to use Metamask for NEVM?</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <List>
            <ListItem>
              <Typography>1. Open PaliWallet</Typography>
            </ListItem>
            <ListItem>
              <Typography>
                2. Click options menu (burger icon on the top right)
              </Typography>
            </ListItem>
            <ListItem>
              <Typography>3. Set default wallet</Typography>
            </ListItem>
            <ListItem>
              <Typography>4. Set Metamask as default wallet</Typography>
            </ListItem>
            <ListItem>
              <Typography>5. Reload this page</Typography>
            </ListItem>
          </List>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
};

export default BridgeMetamaskNevmInstructions;
