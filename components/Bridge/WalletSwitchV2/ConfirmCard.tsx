import { IconButton, Tooltip, Typography } from "@mui/material";
import ChangeCirlce from "@mui/icons-material/ChangeCircle";
import { Box } from "@mui/system";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

type WalletSwitchConfirmCardProps = {
  address: string;
  onChange: () => void;
  onConfirm: () => void;
};

const WalletSwitchConfirmCard: React.FC<WalletSwitchConfirmCardProps> = ({
  address,
  onChange,
  onConfirm,
}) => {
  return (
    <Box>
      <Typography variant="body1">{address}</Typography>
      <Tooltip title="Change">
        <IconButton aria-label="Change" onClick={onChange} color="primary">
          <ChangeCirlce />
        </IconButton>
      </Tooltip>
      <Tooltip title="Confirm">
        <IconButton aria-label="Change" onClick={onConfirm} color="success">
          <CheckCircleIcon />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

export default WalletSwitchConfirmCard;
