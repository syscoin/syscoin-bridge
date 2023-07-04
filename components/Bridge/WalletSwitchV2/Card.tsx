import { Alert, Box, Button, Link, Typography } from "@mui/material";
import Check from "@mui/icons-material/Check";

type WalletSwitchCardProps = {
  address: string;
  balance: string;
  allowChange: boolean;
  onChange: () => void;
  faucetLink?: React.ReactNode;
};

const WalletSwitchCard: React.FC<WalletSwitchCardProps> = ({
  address,
  balance,
  onChange,
  allowChange,
  faucetLink,
}) => {
  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          width: "calc(100%)",
          alignItems: "center",
        }}
      >
        <Typography variant="body2" noWrap display="block" marginRight="auto">
          {address}
        </Typography>
        <Check color="success" />
      </Box>
      <Box display="flex" sx={{ alignItems: "center" }}>
        <Typography marginRight="auto">Balance: {balance}</Typography>
        {allowChange && (
          <Button onClick={onChange} color="primary">
            Change
          </Button>
        )}
      </Box>
      {faucetLink}
    </Box>
  );
};

export default WalletSwitchCard;
