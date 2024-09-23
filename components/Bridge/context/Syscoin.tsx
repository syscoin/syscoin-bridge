import { BlockbookAPIURL, UTXO_NETWORK } from "@contexts/Transfer/constants";
import { createContext, useContext, useMemo } from "react";

import { syscoin } from "syscoinjs-lib";

export const SyscoinContext = createContext<syscoin>(
  new syscoin(null, BlockbookAPIURL, UTXO_NETWORK)
);

export const useSyscoin = () => useContext(SyscoinContext);

export const SyscoinProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const instance = useMemo(
    () => new syscoin(null, BlockbookAPIURL, UTXO_NETWORK),
    []
  );
  return (
    <SyscoinContext.Provider value={instance}>
      {children}
    </SyscoinContext.Provider>
  );
};
