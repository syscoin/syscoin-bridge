import { useNEVM } from "@contexts/ConnectedWallet/NEVMProvider";
import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import { useTransfer } from "@contexts/Transfer/useTransfer";
import { Box, Button, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import CheckBoxIcon from "@mui/icons-material/CheckBox";

const NEVMConnect = () => {
  const { transfer, setNevm } = useTransfer();
  const { account, connect } = useNEVM();
  const { isBitcoinBased, switchTo, changeAccount } = usePaliWalletV2();

  const setTransferNevm = () => {
    if (!account) return;
    setNevm({ address: account });
  };

  const change = () => {
    const prom = isBitcoinBased ? switchTo("ethereum") : Promise.resolve();

    prom.then(() => changeAccount());
  };

  if (
    !isBitcoinBased
      ? transfer.nevmAddress === account
      : Boolean(transfer.nevmAddress)
  ) {
    return (
      <Box>
        <Box display="flex">
          <Typography variant="body1">{transfer.nevmAddress}</Typography>
          <CheckBoxIcon />
        </Box>
        {transfer.status === "initialize" && (
          <Button variant="contained" onClick={change}>
            Change
          </Button>
        )}
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
      <Button variant="contained" onClick={change} sx={{ mr: 2 }}>
        Change
      </Button>
      <Button variant="contained" onClick={setTransferNevm} color="success">
        Confirm <CheckIcon />
      </Button>
    </Box>
  );
};

export default NEVMConnect;
