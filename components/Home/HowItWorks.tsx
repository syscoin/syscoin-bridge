import { Box, Card, CardContent, Typography } from "@mui/material";

const HomeHowItWorks: React.FC = () => {
  return (
    <Box my={4}>
      <Typography variant="h3" textAlign="center" sx={{ mb: 3 }}>
        HOW DOES IT WORK?
      </Typography>
      <Card sx={{ mb: 3, p: 4 }}>
        <CardContent sx={{ px: 8 }}>
          <Typography variant="h5" textAlign="center" sx={{ mb: 3 }}>
            Move SYS between Syscoin UTXO and Syscoin NEVM using
            cryptographic proofs.
          </Typography>
          <Typography
            variant="body1"
            fontStyle="italic"
            textAlign="center"
            sx={{ w: "50%", mb: 3 }}
          >
            A proof-based bridge with no custodian.
          </Typography>

          <Box sx={{ mb: 3 }}>
            <Typography variant="body1" fontWeight="bold">
              Burn or freeze assets on the source chain
            </Typography>
            <Typography variant="body1">
              The source transaction removes the bridged amount from use on
              one chain and produces the data needed to prove that event.
            </Typography>
          </Box>
          <Box>
            <Typography variant="body1" fontWeight="bold">
              Mint the corresponding amount on the destination chain
            </Typography>
            <Typography variant="body1">
              After the bridge validates the source-chain proof, it mints the
              corresponding 1:1 representation on the destination chain.
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default HomeHowItWorks;
