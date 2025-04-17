import { useConstants } from "@contexts/useConstants";
import { createContext, useContext, useMemo } from "react";

import { syscoin, utils as syscoinUtils } from "syscoinjs-lib";

export const SyscoinContext = createContext({} as syscoin);

export const useSyscoin = () => useContext(SyscoinContext);

export const SyscoinProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { data } = useConstants();
  const instance = useMemo(() => {
    if (!data) {
      return null;
    }
    return new syscoin(
      null,
      data.rpc.utxo,
      data.isTestnet
        ? syscoinUtils.syscoinNetworks.testnet
        : syscoinUtils.syscoinNetworks.mainnet
    );
  }, [data]);

  if (!instance) {
    return null;
  }

  return (
    <SyscoinContext.Provider value={instance}>
      {children}
    </SyscoinContext.Provider>
  );
};
