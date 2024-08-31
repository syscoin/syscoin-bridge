import { useMemo } from "react";
import { useWeb3 } from "../context/Web";
import VaultManagerABI from "@contexts/Transfer/abi/VaultManager";
import { VAULT_MANAGER_CONTRACT_ADDRESS } from "@constants";

export const useVaultManagerContract = () => {
  const web3 = useWeb3();
  return useMemo(
    () =>
      new web3.eth.Contract(
        VaultManagerABI,
        VAULT_MANAGER_CONTRACT_ADDRESS
      ),
    [web3]
  );
};
