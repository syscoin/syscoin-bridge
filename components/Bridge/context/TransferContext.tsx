import { ITransfer } from "@contexts/Transfer/types";
import { createContext, useContext } from "react";
import { UseMutateFunction, useMutation, useQuery } from "react-query";
import isTransfer from "utils/isTransfer";
import {
  getOrCreateTransferWriteToken,
  getTransferWriteToken,
} from "utils/transfer-write-token";

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

const isSafeTransferId = (id: string) => {
  if (!id) {
    return false;
  }

  for (const char of id) {
    const code = char.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isUppercase = code >= 65 && code <= 90;
    const isLowercase = code >= 97 && code <= 122;
    if (!isDigit && !isUppercase && !isLowercase && char !== "-" && char !== "_") {
      return false;
    }
  }

  return true;
};

const buildTransferPath = (id: string) => {
  if (!isSafeTransferId(id)) {
    throw new Error("Invalid transfer ID");
  }

  return `/api/transfer/${encodeURIComponent(id)}`;
};

export const TransferContextProvider: React.FC<
  TransferContextProviderProps
> = ({ children, transfer: initialData }) => {
  const { data: transfer, refetch: refetchTransfer } = useQuery(
    ["transfer", initialData.id],
    {
      queryFn: async (): Promise<ITransfer> => {
        const url = buildTransferPath(initialData.id);
        const res = await fetch(url);
        const jsonData = await res.json();
        if (isTransfer(jsonData)) {
          return jsonData;
        }
        throw new Error("Invalid transfer");
      },
      initialData,
      enabled:
        initialData.status !== "initialize" && initialData.id !== undefined,
    }
  );

  const { mutate: saveTransfer, isLoading: isSaving } = useMutation(
    ["transfer", initialData.id],
    async (updatedTransfer: ITransfer) => {
      const url = buildTransferPath(initialData.id);
      const writeToken =
        getTransferWriteToken(initialData.id) ??
        (initialData.status === "initialize"
          ? getOrCreateTransferWriteToken(initialData.id)
          : undefined);
      const res = await fetch(url, {
        method: "PATCH",
        body: JSON.stringify(updatedTransfer),
        headers: {
          "Content-Type": "application/json",
          ...(writeToken
            ? { Authorization: `Bearer ${writeToken}` }
            : {}),
        },
      });
      const jsonData = await res.json();
      if (isTransfer(jsonData)) {
        return jsonData;
      }
      throw new Error(
        typeof jsonData?.message === "string"
          ? jsonData.message
          : "Invalid transfer"
      );
    },
    {
      onSuccess: () => refetchTransfer(),
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
