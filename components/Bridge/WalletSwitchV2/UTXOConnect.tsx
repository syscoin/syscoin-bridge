import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import { useTransfer } from "@contexts/Transfer/useTransfer";
import { Box, Button, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import CheckBoxIcon from "@mui/icons-material/CheckBox";

const UTXOConnect = () => {
  const { transfer, setUtxo } = useTransfer();
  const {
    isBitcoinBased,
    switchTo,
    connectedAccount,
    xpubAddress,
    changeAccount,
  } = usePaliWalletV2();

  const setTransferUtxo = () => {
    if (!connectedAccount || !xpubAddress) return;
    setUtxo({ xpub: xpubAddress, address: connectedAccount });
  };

  const change = () => {
    const prom = !isBitcoinBased ? switchTo("bitcoin") : Promise.resolve();
    setUtxo({ xpub: "", address: "" });
    prom.then(() => changeAccount());
  };

  if (
    isBitcoinBased
      ? transfer.utxoAddress === connectedAccount
      : Boolean(transfer.utxoAddress)
  ) {
    return (
      <Box>
        <Box display="flex">
          <Typography variant="body1" color="success">
            {transfer.utxoAddress}
          </Typography>
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

  if (!isBitcoinBased) {
    return (
      <Button variant="contained" onClick={() => switchTo("bitcoin")}>
        Set Syscoin Core
      </Button>
    );
  }

  return (
    <Box>
      <Typography variant="body1">{connectedAccount}</Typography>
      <Button variant="contained" onClick={change} sx={{ mr: 2 }}>
        Change
      </Button>
      <Button variant="contained" onClick={setTransferUtxo} color="success">
        Confirm <CheckIcon />
      </Button>
    </Box>
  );
};

export default UTXOConnect;
