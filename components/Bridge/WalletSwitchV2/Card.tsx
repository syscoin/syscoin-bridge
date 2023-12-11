import { Box, Button, Typography, useTheme } from "@mui/material";

type WalletSwitchCardProps = {
  address: string;
  balance: string | React.ReactNode;
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
  const {
    palette: { success },
  } = useTheme();
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
        <Typography variant="body2" color={success.main}>
          CONFIRMED
        </Typography>
        {allowChange && (
          <Button
            onClick={onChange}
            size="small"
            variant="outlined"
            sx={{ ml: 2 }}
            color="secondary"
          >
            Change
          </Button>
        )}
      </Box>
      <Box display="flex" sx={{ alignItems: "center" }}>
        {typeof balance === "string" ? (
          <Typography marginRight="auto">Balance: {balance}</Typography>
        ) : (
          balance
        )}
      </Box>
      {faucetLink}
    </Box>
  );
};

export default WalletSwitchCard;
