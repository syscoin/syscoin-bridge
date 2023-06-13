import {
  Box,
  Button,
  IconButton,
  Link,
  Tooltip,
  Typography,
} from "@mui/material";
import Check from "@mui/icons-material/Check";

type WalletSwitchCardProps = {
  address: string;
  balance: string;
  allowChange: boolean;
  onChange: () => void;
  faucetLink?: string;
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
          width: "calc(100% - 1rem)",
          alignItems: "center",
        }}
      >
        <Tooltip title={address}>
          <Typography variant="body1" noWrap>
            {address}
          </Typography>
        </Tooltip>
        <Check color="success" />
        {allowChange && (
          <Button onClick={onChange} color="primary">
            Change
          </Button>
        )}
      </Box>
      <Typography>Balance: {balance}</Typography>
      {faucetLink && (
        <Link href={faucetLink} variant="body2" target="_blank">
          You don&apos;t have enough balance. Please go to Faucet
        </Link>
      )}
    </Box>
  );
};

export default WalletSwitchCard;
