import { useMemo } from "react";
import { useWeb3 } from "../context/Web";
import SyscoinERC20ManagerABI from "@contexts/Transfer/abi/SyscoinERC20Manager";
import { useFeatureFlags } from "./useFeatureFlags";
import { useConstants } from "./useConstants";

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
          : "0x7904299b3D3dC1b03d1DdEb45E9fDF3576aCBd5f"
      ),
    [web3, flags, constants?.contracts.ecr20ManagerContract.address]
  );
};
