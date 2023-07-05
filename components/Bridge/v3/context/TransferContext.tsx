import { ITransfer } from "@contexts/Transfer/types";
import { createContext, useContext } from "react";
import { useQuery } from "react-query";
import isTransfer from "utils/isTransfer";

export interface ITransferContext {
  transfer: ITransfer;
}

export const TransferContext = createContext<ITransferContext>(
  {} as ITransferContext
);

export const useTransfer = () => useContext(TransferContext);

type TransferContextProviderProps = {
  children: React.ReactNode;
  transfer: ITransfer;
};

export const TransferContextProvider: React.FC<
  TransferContextProviderProps
> = ({ children, transfer: initialData }) => {
  const { data: transfer } = useQuery(["transfer", initialData.id], {
    queryFn: async (): Promise<ITransfer> => {
      const url = `/api/transfer/${initialData.id}`;
      const res = await fetch(url);
      const jsonData = res.json();
      if (isTransfer(jsonData)) {
        return jsonData;
      }
      throw new Error("Invalid transfer");
    },
    initialData,
    enabled: initialData.status !== "initialize",
  });
  return (
    <TransferContext.Provider value={{ transfer: transfer ?? initialData }}>
      {children}
    </TransferContext.Provider>
  );
};
