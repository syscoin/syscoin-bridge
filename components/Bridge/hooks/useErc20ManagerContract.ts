import { useMemo } from "react";
import { useWeb3 } from "../context/Web";
import SyscoinERC20ManagerABI from "@contexts/Transfer/abi/SyscoinERC20Manager";
import { useFeatureFlags } from "./useFeatureFlags";
import { useConstants } from "@contexts/useConstants";

export const useErc20ManagerContract = () => {
  const web3 = useWeb3();
  const flags = useFeatureFlags();
  const { data: constants } = useConstants();
  return useMemo(
    () =>
      new web3.eth.Contract(
        SyscoinERC20ManagerABI,
        flags.isEnabled("isSys5Enabled")
          ? constants?.contracts.ecr20ManagerContract.address
          : "0x28bD37C0926575f2568ea8f297c0745EF16174Ab"
      ),
    [web3, flags, constants?.contracts.ecr20ManagerContract.address]
  );
};
