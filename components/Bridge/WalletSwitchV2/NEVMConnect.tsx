import { useNEVM } from "@contexts/ConnectedWallet/NEVMProvider";
import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import { useTransfer } from "@contexts/Transfer/useTransfer";
import { Box, Button, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import CheckBoxIcon from "@mui/icons-material/CheckBox";

const NEVMConnect = () => {
  const { transfer, setNevm } = useTransfer();
  const { account, connect } = useNEVM();
  const { isBitcoinBased, switchTo } = usePaliWalletV2();

  const setTransferNevm = () => {
    if (!account) return;
    setNevm({ address: account });
  };

  if (transfer.nevmAddress) {
    return (
      <Box display="flex">
        <Typography variant="body1">{transfer.nevmAddress}</Typography>
        <CheckBoxIcon />
      </Box>
    );
  }

  if (isBitcoinBased) {
    return (
      <Button variant="contained" onClick={() => switchTo("ethereum")}>
        Set NEVM
      </Button>
    );
  }

  if (!account) {
    return <Button onClick={() => connect()}>Fetch account</Button>;
  }

  return (
    <Box>
      <Typography variant="body1">{account}</Typography>
      <Button variant="contained" onClick={setTransferNevm} color="success">
        Confirm <CheckIcon />
      </Button>
    </Box>
  );
};

export default NEVMConnect;
