import { ITransfer } from "@contexts/Transfer/types";
import AddUTXOTransactionModal from "./AddUTXOTransactionModal";
import {
  BURN_SYSX_NEVM_TOKEN_TYPE,
  BURN_SYSX_SYS_TOKEN_TYPE,
} from "api/services/admin-transfer/constants";

type Props = {
  onClose: (refetch?: boolean) => void;
  transfer: ITransfer;
};

const AddBurnSysxTransaction: React.FC<Props> = ({ onClose, transfer }) => {
  return (
    <AddUTXOTransactionModal
      onClose={onClose}
      operation="burn-sysx"
      tokenType={
        transfer.type === "sys-to-nevm"
          ? BURN_SYSX_NEVM_TOKEN_TYPE
          : BURN_SYSX_SYS_TOKEN_TYPE
      }
      transferId={transfer.id}
    />
  );
};

export default AddBurnSysxTransaction;
