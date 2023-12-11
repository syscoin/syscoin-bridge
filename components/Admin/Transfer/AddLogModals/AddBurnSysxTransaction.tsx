import AddUTXOTransactionModal from "./AddUTXOTransactionModal";

type Props = {
  onClose: (refetch?: boolean) => void;
  transferId: string;
};

type FormValues = {
  txId: string;
  clearAll: boolean;
};

const AddBurnSysxTransaction: React.FC<Props> = ({ onClose, transferId }) => {
  return (
    <AddUTXOTransactionModal
      onClose={onClose}
      operation="burn-sysx"
      tokenType="SPTAssetAllocationBurnToNEVM"
      transferId={transferId}
    />
  );
};

export default AddBurnSysxTransaction;
