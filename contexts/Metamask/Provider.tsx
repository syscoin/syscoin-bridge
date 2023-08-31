import { provider } from "web3-core";
import { useQuery } from "react-query";
import { createContext, useContext } from "react";

declare global {
  interface Window {
    ethereum: {
      isMetaMask: boolean;
      request: (params: { method: string; params?: any }) => Promise<any>;
      send: (params: { method: string; params?: any }) => Promise<any>;
      isConnected: boolean;
      selectedAddress: string;
      on: (event: string, callback: (...args: any[]) => void) => void;
      networkVersion: string;
      wallet: string;
    } & provider;
  }
}

interface IMetamaskContext {
  isEnabled: boolean;
}

const MetamaskContext = createContext<IMetamaskContext>({
  isEnabled: false,
});

export const useMetamask = () => useContext(MetamaskContext);

const MetamaskProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { data: isEnabled } = useQuery(["metamask", "enabled"], {
    queryFn: () => {
      return (
        typeof window.ethereum !== "undefined" && window.ethereum.isMetaMask
      );
    },
  });

  return (
    <MetamaskContext.Provider value={{ isEnabled: Boolean(isEnabled) }}>
      {children}
    </MetamaskContext.Provider>
  );
};

export default MetamaskProvider;
