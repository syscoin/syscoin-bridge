import { MINT_SYSX_TOKEN_TYPE } from "api/services/admin-transfer/constants";
import AddUTXOTransactionModal from "./AddUTXOTransactionModal";

type Props = {
  onClose: (refetch?: boolean) => void;
  transferId: string;
};

const AddMintSysxTransaction: React.FC<Props> = ({ onClose, transferId }) => {
  return (
    <AddUTXOTransactionModal
      onClose={onClose}
      operation="mint-sysx"
      tokenType={MINT_SYSX_TOKEN_TYPE}
      transferId={transferId}
    />
  );
};

export default AddMintSysxTransaction;
