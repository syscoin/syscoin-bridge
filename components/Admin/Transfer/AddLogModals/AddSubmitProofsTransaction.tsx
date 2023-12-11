import AddNEVMTransactionModal from "./AddNEVMTransactionModal";

type Props = {
  onClose: (refetch?: boolean) => void;
  transferId: string;
};

const AddSubmitProofsTransaction: React.FC<Props> = ({
  onClose,
  transferId,
}) => {
  return (
    <AddNEVMTransactionModal
      onClose={onClose}
      operation="submit-proofs"
      transferId={transferId}
    />
  );
};

export default AddSubmitProofsTransaction;
