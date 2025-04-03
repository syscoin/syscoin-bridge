import AddUTXOTransactionModal from "./AddUTXOTransactionModal";

type Props = {
  onClose: (refetch?: boolean) => void;
  transferId: string;
};

type FormValues = {
  txId: string;
  clearAll: boolean;
};

const AddMintSysxTransaction: React.FC<Props> = ({ onClose, transferId }) => {
  return (
    <AddUTXOTransactionModal
      onClose={onClose}
      operation="mint-sysx"
      tokenType="SPTAssetAllocationMint"
      transferId={transferId}
    />
  );
};

export default AddMintSysxTransaction;
