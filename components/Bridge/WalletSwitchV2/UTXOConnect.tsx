import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import { useTransfer } from "@contexts/Transfer/useTransfer";
import { Box, Button, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import CheckBoxIcon from "@mui/icons-material/CheckBox";

const UTXOConnect = () => {
  const { transfer, setUtxo } = useTransfer();
  const { isBitcoinBased, switchTo, connectedAccount, xpubAddress } =
    usePaliWalletV2();

  const setTransferUtxo = () => {
    if (!connectedAccount || !xpubAddress) return;
    setUtxo({ xpub: xpubAddress, address: connectedAccount });
  };

  if (transfer.utxoXpub) {
    return (
      <Box display="flex">
        <Typography variant="body1" color="success">
          {transfer.utxoAddress}
        </Typography>
        <CheckBoxIcon />
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
      <Button variant="outlined" onClick={setTransferUtxo} color="success">
        Set <CheckIcon />
      </Button>
    </Box>
  );
};

export default UTXOConnect;
