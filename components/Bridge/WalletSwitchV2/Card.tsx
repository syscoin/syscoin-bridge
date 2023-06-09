import { Box, Button, IconButton, Tooltip, Typography } from "@mui/material";
import Check from "@mui/icons-material/Check";
import ChangeCirlce from "@mui/icons-material/ChangeCircle";

type WalletSwitchCardProps = {
  address: string;
  balance: string;
  allowChange: boolean;
  onChange: () => void;
};

const WalletSwitchCard: React.FC<WalletSwitchCardProps> = ({
  address,
  balance,
  onChange,
  allowChange,
}) => {
  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          width: "calc(100% - 1rem)",
          alignItems: "center",
        }}
      >
        <Typography variant="body1" noWrap>
          {address}
        </Typography>
        <Check color="success" />
        {allowChange && (
          <Button onClick={onChange} color="primary">
            Change
          </Button>
        )}
      </Box>
      <Typography>Balance: {balance}</Typography>
    </Box>
  );
};

export default WalletSwitchCard;
