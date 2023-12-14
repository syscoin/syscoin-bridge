import AddNEVMTransactionModal from "./AddNEVMTransactionModal";

type Props = {
  onClose: (refetch?: boolean) => void;
  transferId: string;
};

const AddFreezeBurnTransactionModal: React.FC<Props> = ({
  onClose,
  transferId,
}) => {
  return (
    <AddNEVMTransactionModal
      onClose={onClose}
      operation="freeze-burn-sys"
      transferId={transferId}
    />
  );
};

export default AddFreezeBurnTransactionModal;
