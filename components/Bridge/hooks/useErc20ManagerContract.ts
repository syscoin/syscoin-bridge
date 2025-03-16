import { useMemo } from "react";
import { useWeb3 } from "../context/Web";
import SyscoinERC20ManagerABI from "@contexts/Transfer/abi/SyscoinERC20Manager";

export const useErc20ManagerContract = () => {
  const web3 = useWeb3();
  return useMemo(
    () =>
      new web3.eth.Contract(
        SyscoinERC20ManagerABI,
        "0x7904299b3D3dC1b03d1DdEb45E9fDF3576aCBd5f"
      ),
    [web3]
  );
};
