import { ITransfer } from "@contexts/Transfer/types";
import { Box, Button, Container, Modal, Typography } from "@mui/material";
import { AdminLayoutContainer } from "components/Admin/LayoutContainer";
import { GetServerSideProps, NextPage } from "next";
import { ArrowCircleLeft } from "@mui/icons-material";
import Link from "next/link";
import MuiLink from "@mui/material/Link";
import { FormProvider, useForm } from "react-hook-form";
import AdminTransferStatusSelect from "components/Admin/Transfer/StatusField";
import { useNEVM } from "@contexts/ConnectedWallet/NEVMProvider";
import { formatRelative } from "date-fns";
import { Change, OverrideTransferRequestBody } from "api/types/admin";
import { useState } from "react";
import AddLogMenu, {
  SupportedOperations,
} from "components/Admin/Transfer/AddLog";
import AddBurnSysTransaction from "components/Admin/Transfer/AddLogModals/AddBurnSysTransaction";
import { useQuery } from "react-query";
import AddBurnSysxTransaction from "components/Admin/Transfer/AddLogModals/AddBurnSysxTransaction";
import AdminTransferLogAccordion from "components/Admin/Transfer/LogAccordion";
import AddSubmitProofsTransaction from "components/Admin/Transfer/AddLogModals/AddSubmitProofsTransaction";
import { Web3Provider } from "components/Bridge/context/Web";
import AddFreezeBurnTransactionModal from "components/Admin/Transfer/AddLogModals/AddFreezeBurnTransactionModal";
import AddMintSysxTransaction from "components/Admin/Transfer/AddLogModals/AddMintSysxTransaction";
import { useConstants } from "@contexts/useConstants";
import { buildApiUrl } from "utils/api-base-url";

type Props = {
  initialTransfer: ITransfer;
};

type FormValues = Pick<ITransfer, "status">;

const TransferDetailsPage: NextPage<Props> = ({ initialTransfer }) => {
  const { constants } = useConstants();
  const { signMessage } = useNEVM();
  const [addLogModal, setAddLogModal] = useState<SupportedOperations>();
  const transferUrl = `/api/admin/transfers/${initialTransfer.id}`;
  const { data: transfer, refetch } = useQuery<ITransfer>(
    ["transfer", initialTransfer.id],
    {
      queryFn: async () => {
        const resp = await fetch(transferUrl, {
          credentials: "include",
        });

        return resp.json();
      },
      initialData: initialTransfer,
    }
  );

  const form = useForm<FormValues>({
    mode: "all",
    defaultValues: {
      status: transfer?.status ?? initialTransfer.status,
    },
  });

  if (!transfer) {
    return null;
  }

  const {
    handleSubmit,
    formState: { isDirty, isValid },
  } = form;

  const onUpdate = (signedMessage: string, changes: Change[]) => {
    const body: OverrideTransferRequestBody = {
      signedMessage,
      changes,
    };
    fetch(`/api/admin/transfer/${transfer.id}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
    })
      .then((res) => {
        if (res.ok) {
          return res.json();
        }
      })
      .then((updatedTransfer) => {
        refetch();
        form.reset({
          status: updatedTransfer.status,
        });
      });
  };

  const onSubmit = async (data: FormValues) => {
    const changes: Change[] = [];
    Object.keys(data).forEach((key) => {
      const transferKey = key as keyof FormValues;
      if (transfer[transferKey] !== data[transferKey]) {
        changes.push({
          property: transferKey,
          from: transfer[transferKey],
          to: data[transferKey],
        });
      }
    });
    const hexString = `0x${Buffer.from(
      JSON.stringify(changes),
      "utf8"
    ).toString("hex")}`;
    signMessage(hexString).then((signedMessage) => {
      return onUpdate(signedMessage, changes);
    });
  };

  const closeAddLogModal = (isSuccess?: boolean) => {
    if (isSuccess) {
      refetch();
    }
    setAddLogModal(undefined);
  };

  return (
    <Web3Provider>
      <AdminLayoutContainer>
        <Container sx={{ mb: 2 }}>
          <Button LinkComponent={Link} href="/admin">
            <ArrowCircleLeft />
            Back to Transfer List
          </Button>
          <Typography variant="h6">#{transfer.id}</Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            NEVM Address:
            <MuiLink
              href={`${constants?.explorer.nevm}/address/${transfer.nevmAddress}`}
              target="_blank"
              sx={{ ml: 2 }}
            >
              {transfer.nevmAddress}
            </MuiLink>
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            UTXO Address:
            <MuiLink
              href={`${constants?.explorer.utxo}/address/${transfer.utxoAddress}`}
              target="_blank"
              sx={{ ml: 2 }}
            >
              {transfer.utxoAddress}
            </MuiLink>
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Created: {formatRelative(new Date(transfer.createdAt), new Date())}
          </Typography>
          <Box component="form" onSubmit={handleSubmit(onSubmit)}>
            <FormProvider {...form}>
              <AdminTransferStatusSelect transfer={transfer} />
            </FormProvider>
            <Button
              sx={{ display: "block" }}
              variant="contained"
              type="submit"
              disabled={!isDirty || !isValid}
            >
              Update
            </Button>
          </Box>
        </Container>
        <Container sx={{ py: 2, mb: 2 }}>
          <Box display="flex" justifyContent="space-between">
            <Typography variant="h6">Transfer Logs</Typography>
            <AddLogMenu transfer={transfer} onSelect={setAddLogModal} />
          </Box>
          {transfer.logs.map((log) => (
            <AdminTransferLogAccordion
              key={log.date}
              transferId={transfer.id}
              log={log}
              onDelete={refetch}
            />
          ))}
        </Container>
        <Modal open={Boolean(addLogModal)}>
          <>
            {addLogModal === "burn-sys" && (
              <AddBurnSysTransaction
                onClose={closeAddLogModal}
                transferId={transfer.id}
              />
            )}
            {addLogModal === "burn-sysx" && (
              <AddBurnSysxTransaction
                onClose={closeAddLogModal}
                transferId={transfer.id}
              />
            )}
            {addLogModal === "submit-proofs" && (
              <AddSubmitProofsTransaction
                onClose={closeAddLogModal}
                transferId={transfer.id}
              />
            )}
            {addLogModal === "mint-sysx" && (
              <AddMintSysxTransaction
                onClose={closeAddLogModal}
                transferId={transfer.id}
              />
            )}
            {addLogModal === "freeze-burn-sys" && (
              <AddFreezeBurnTransactionModal
                onClose={closeAddLogModal}
                transferId={transfer.id}
              />
            )}
          </>
        </Modal>
      </AdminLayoutContainer>
    </Web3Provider>
  );
};

export const getServerSideProps: GetServerSideProps = async ({
  params,
  req,
}) => {
  const rawId = params?.["id"];
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  if (!id) {
    return {
      notFound: true,
    };
  }

  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = (
    Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto
  )?.split(",")[0]?.trim() || "http";
  const host = req.headers.host || "localhost:3000";
  const fallbackOrigin = `${protocol}://${host}`;
  const requestUrl = buildApiUrl(`/api/admin/transfers/${id}`, {
    fallbackOrigin,
  });

  const response = await fetch(requestUrl, {
    headers: {
      cookie: req.headers.cookie || "",
    },
  });

  if (response.status === 401) {
    return {
      redirect: {
        destination: "/admin/login",
        permanent: false,
      },
    };
  }

  if (response.status === 404) {
    return {
      notFound: true,
    };
  }

  if (!response.ok) {
    throw new Error("Failed to fetch transfer");
  }

  const transfer = await response.json();

  return {
    props: {
      initialTransfer: transfer,
    },
  };
};

export default TransferDetailsPage;
