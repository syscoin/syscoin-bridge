import { COMMON_STATUS, ITransfer } from "@contexts/Transfer/types";
import { useNEVM } from "@contexts/ConnectedWallet/NEVMProvider";
import { isPaliV2UtxoMode } from "@contexts/PaliWallet/network-query-policy";
import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
import { createContext, useContext, useRef, useState } from "react";
import { Alert, Button } from "@mui/material";
import { UseMutateFunction, useMutation, useQuery, useQueryClient } from "react-query";
import isTransfer from "utils/isTransfer";
import {
  buildTransferPath,
  readTransferDetail,
  TransferReadError,
} from "utils/transfer-detail";
import {
  getOrCreateTransferWriteToken,
  getTransferWriteToken,
} from "utils/transfer-write-token";
import {
  requestTransferCreationAuthorization,
  TransferCreationAuthorization,
} from "../transfer-creation-authorization";

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

type PendingCreation = {
  payload: string;
  writeToken: string;
  request: Promise<TransferCreationAuthorization>;
};

export const TransferContextProvider: React.FC<
  TransferContextProviderProps
> = ({ children, transfer: initialData }) => {
  const [isRetryingSave, setIsRetryingSave] = useState(false);
  const creation = useRef<PendingCreation>();
  const { expectedChainId } = useNEVM();
  const { version, isEVMInjected, isBitcoinBased, switchTo } = usePaliWalletV2();
  const queryClient = useQueryClient();
  const {
    data: transfer,
    error: transferError,
    refetch: refetchTransfer,
  } = useQuery(
    ["transfer", initialData.id],
    {
      queryFn: () =>
        readTransferDetail(initialData.id, getTransferWriteToken(initialData.id)),
      initialData,
      enabled:
        initialData.status !== "initialize" && initialData.id !== undefined,
      retry: (failureCount, error) =>
        !(error instanceof TransferReadError && error.status === 404) &&
        failureCount < 3,
    }
  );

  const {
    mutate: saveTransfer,
    isLoading: isSaving,
    isError: isSaveError,
    error: saveError,
    variables: unsavedTransfer,
  } = useMutation(
    ["transfer", initialData.id],
    async (updatedTransfer: ITransfer) => {
      const url = buildTransferPath(initialData.id);
      if (updatedTransfer.id !== initialData.id) {
        throw new Error("Transfer details no longer match this page.");
      }
      const creating = initialData.status === COMMON_STATUS.INITIALIZE &&
        (!transfer || transfer.status === COMMON_STATUS.INITIALIZE);
      const writeToken =
        getTransferWriteToken(initialData.id) ??
        (creating
          ? getOrCreateTransferWriteToken(initialData.id)
          : undefined);
      const payload = JSON.stringify(updatedTransfer);
      let authorization: TransferCreationAuthorization | undefined;
      let pendingCreation: PendingCreation | undefined;
      if (creating && writeToken) {
        if (creation.current?.payload !== payload || creation.current.writeToken !== writeToken) {
          creation.current = {
            payload,
            writeToken,
            request: requestTransferCreationAuthorization({
              transfer: updatedTransfer,
              url,
              writeToken,
              expectedChainId,
              getWallet: () => window.ethereum,
              switchToNevm: isPaliV2UtxoMode(version, isEVMInjected, isBitcoinBased)
                ? () => switchTo("ethereum")
                : undefined,
            }),
          };
        }
        pendingCreation = creation.current;
        try {
          authorization = await pendingCreation.request;
        } catch (error) {
          if (creation.current === pendingCreation) creation.current = undefined;
          throw error;
        }
      }
      const res = await fetch(url, {
        method: "PATCH",
        credentials: "same-origin",
        redirect: "error",
        body: authorization
          ? JSON.stringify({ ...updatedTransfer, creationAuthorization: authorization })
          : payload,
        headers: {
          "Content-Type": "application/json",
          ...(writeToken
            ? { Authorization: `Bearer ${writeToken}` }
            : {}),
        },
      });
      if (pendingCreation && creation.current === pendingCreation && res.status === 401) {
        // The challenge may have expired. The next explicit submit can sign
        // a fresh one. Transport failures retain the current authorization.
        creation.current = undefined;
      }
      const jsonData = await res.json().catch(() => null);
      if (res.ok && isTransfer(jsonData) && jsonData.id === initialData.id) {
        if (pendingCreation && creation.current === pendingCreation) creation.current = undefined;
        return jsonData;
      }
      throw new Error(
        typeof jsonData?.message === "string"
          ? jsonData.message
          : "Invalid transfer"
      );
    },
    {
      onSuccess: (savedTransfer) => {
        queryClient.setQueryData(["transfer", initialData.id], savedTransfer);
        return refetchTransfer();
      },
    }
  );

  if (
    !transfer?.status &&
    transferError instanceof TransferReadError &&
    transferError.status === 404
  ) {
    return (
      <Alert severity="info" sx={{ mt: 10, mx: 3 }}>
        This transfer is unavailable. If you started it, open it in the browser
        profile you used to create it.
      </Alert>
    );
  }

  return (
    <TransferContext.Provider
      value={{ transfer: transfer ?? initialData, saveTransfer, isSaving }}
    >
      {(isSaving || isSaveError || isRetryingSave) &&
      unsavedTransfer &&
      initialData.status !== COMMON_STATUS.INITIALIZE ? (
        <Alert
          severity={isSaving ? "info" : "error"}
          sx={{ mt: 10, mx: 3 }}
          action={
            <Button
              disabled={isSaving}
              onClick={() => {
                setIsRetryingSave(true);
                // Retry persistence only, never the transaction-signing step.
                saveTransfer(unsavedTransfer, {
                  onSettled: () => setIsRetryingSave(false),
                });
              }}
            >
              Retry
            </Button>
          }
        >
          {isSaving
            ? "Saving transfer..."
            : `Unable to save transfer: ${
                saveError instanceof Error ? saveError.message : "Please retry."
              }`}
        </Alert>
      ) : (
        <>
          {isSaveError && initialData.status === COMMON_STATUS.INITIALIZE && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {saveError instanceof Error ? saveError.message : "Unable to start the transfer. Please try again."}
            </Alert>
          )}
          {children}
        </>
      )}
    </TransferContext.Provider>
  );
};
