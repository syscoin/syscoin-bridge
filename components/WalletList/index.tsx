import { Box, Typography } from "@mui/material";
import WalletListPaliWallet from "./PaliWallet";
import WalletListMetamask from "./MetaMask";

const WalletList: React.FC = () => {
  return (
    <Box>
      <Typography variant="body2">Connect Wallet:</Typography>
      <WalletListPaliWallet />
      <WalletListMetamask />
    </Box>
  );
};

export default WalletList;
