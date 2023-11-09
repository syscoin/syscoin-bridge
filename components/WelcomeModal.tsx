import { Check } from "@mui/icons-material";
import {
  Box,
  Button,
  Link,
  List,
  ListItem,
  ListItemIcon,
  Modal,
  Typography,
} from "@mui/material";
import React, { useEffect, useState } from "react";

const LOCAL_STORAGE_KEY = "agreeToTerms";

type LinkToNewTabProps = {
  link: string;
  label?: string;
};

const LinkToNewTab: React.FC<LinkToNewTabProps> = ({ label, link }) => {
  return (
    <Typography component={Link} color="primary" target="_blank" href={link}>
      {label ?? link}
    </Typography>
  );
};

const terms: (string | React.ReactNode)[] = [
  "We will NEVER ask you for your private keys or seed phrase.",
  "This software is subject to change.",
  <>
    Technical support is available only via the ticket system in Syscoin&apos;s
    official Discord server at{" "}
    <LinkToNewTab link="https://discord.gg/syscoin" />
  </>,
  "Technical support for an incomplete bridge session must be sought within 75 days from when the session began.",
];

const WelcomeModal = () => {
  const [open, setOpen] = useState(false);

  const agreeToTerms = () => {
    localStorage.setItem(LOCAL_STORAGE_KEY, "true");
    setOpen(false);
  };
  useEffect(() => {
    if (localStorage.getItem(LOCAL_STORAGE_KEY) !== "true") {
      setOpen(true);
    }
  }, []);
  return (
    <Modal open={open}>
      <Box
        sx={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 500,
          bgcolor: "background.paper",
          border: "2px solid #000",
          boxShadow: 24,
          borderRadius: 4,
          p: 4,
        }}
      >
        <Typography variant="h5">Welcome to the Syscoin Bridge</Typography>
        <List dense sx={{ my: 2 }}>
          {terms.map((term, i) => (
            <ListItem key={i}>
              <ListItemIcon>
                <Check />
              </ListItemIcon>
              <Typography variant="body1">{term}</Typography>
            </ListItem>
          ))}
        </List>
        <Typography variant="body1">
          By clicking the button below, you agree to our{" "}
          <LinkToNewTab
            link={"/Syscoin Terms and Conditions.pdf"}
            label={"Terms and Conditions."}
          />
        </Typography>
        <Button
          variant="contained"
          sx={{ mt: 2 }}
          fullWidth
          onClick={agreeToTerms}
        >
          Agree to terms
        </Button>
      </Box>
    </Modal>
  );
};

export default WelcomeModal;
