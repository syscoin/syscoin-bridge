import { Box, Container, Link, Typography } from "@mui/material";

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();
  return (
    <Container sx={{ p: 4 }}>
      <Box display="flex" flexDirection="column" gap={2} mb={2}>
        <Link href="https://syscoin.org/">Syscoin.org</Link>
        <Link href="https://faucet.syscoin.org/">Syscoin faucet</Link>
        <Link href="https://linktr.ee/Syscoin_Platform">Syscoin links</Link>
        <Link href="https://syscoin.readme.io/">Developer Portal</Link>
        <Link href="https://blockbook.syscoin.org">Syscoin UTXO Explorer</Link>
        <Link href="https://explorer.syscoin.org">Syscoin NEVM Explorer</Link>
        
        <Link href="https://github.com/syscoin">Syscoin Github</Link>
      </Box>
      <Typography variant="body2">
        © {currentYear} Syscoin. All rights reserved
      </Typography>
    </Container>
  );
};

export default Footer;
