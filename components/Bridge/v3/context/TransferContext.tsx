import { ITransfer } from "@contexts/Transfer/types";
import { createContext, useContext } from "react";
import { UseMutateFunction, useMutation, useQuery } from "react-query";
import isTransfer from "utils/isTransfer";

export interface ITransferContext {
  transfer: ITransfer;
  saveTransfer: UseMutateFunction<ITransfer, unknown, ITransfer, unknown>;
  isSaving: boolean;
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
      const res = await fetch(url, {
        headers: { "Content-Type": "application/json" },
      });
      const jsonData = await res.json();
      if (isTransfer(jsonData)) {
        return jsonData;
      }
      throw new Error("Invalid transfer");
    },
    initialData,
    enabled: initialData.status !== "initialize",
  });

  const { mutate: saveTransfer, isLoading: isSaving } = useMutation(
    ["transfer", initialData.id],
    async (updatedTransfer: ITransfer) => {
      const url = `/api/transfer/${initialData.id}`;
      const res = await fetch(url, {
        method: "PATCH",
        body: JSON.stringify(updatedTransfer),
        headers: {
          "Content-Type": "application/json",
        },
      });
      const jsonData = await res.json();
      if (isTransfer(jsonData)) {
        return jsonData;
      }
      throw new Error("Invalid transfer");
    }
  );

  return (
    <TransferContext.Provider
      value={{ transfer: transfer ?? initialData, saveTransfer, isSaving }}
    >
      {children}
    </TransferContext.Provider>
  );
};
