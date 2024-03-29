import AddUTXOTransactionModal from "./AddUTXOTransactionModal";

type Props = {
  onClose: (refetch?: boolean) => void;
  transferId: string;
};

const AddBurnSysTransaction: React.FC<Props> = ({ onClose, transferId }) => {
  return (
    <AddUTXOTransactionModal
      onClose={onClose}
      operation="burn-sys"
      tokenType="SPTSyscoinBurnToAssetAllocation"
      transferId={transferId}
    />
  );
};

export default AddBurnSysTransaction;
