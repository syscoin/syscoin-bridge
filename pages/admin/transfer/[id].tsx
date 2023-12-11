import { ITransfer } from "@contexts/Transfer/types";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Container,
  IconButton,
  Modal,
  Typography,
} from "@mui/material";
import { AdminLayoutContainer } from "components/Admin/LayoutContainer";
import dbConnect from "lib/mongodb";
import { GetServerSideProps, NextPage } from "next";
import TransferModel from "models/transfer";
import { ArrowCircleLeft, Delete } from "@mui/icons-material";
import Link from "next/link";
import MuiLink from "@mui/material/Link";
import { FormProvider, useForm } from "react-hook-form";
import AdminTransferStatusSelect from "components/Admin/Transfer/StatusField";
import { useNEVM } from "@contexts/ConnectedWallet/NEVMProvider";
import { formatRelative } from "date-fns";
import { Change, OverrideTransferRequestBody } from "api/types/admin";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useState } from "react";
import AddLogMenu, {
  SupportedOperations,
} from "components/Admin/Transfer/AddLog";
import AddBurnSysTransaction from "components/Admin/Transfer/AddLogModals/AddBurnSysTransaction";
import { useMutation, useQuery } from "react-query";
import AddBurnSysxTransaction from "components/Admin/Transfer/AddLogModals/AddBurnSysxTransaction";
import AdminTransferLogAccordion from "components/Admin/Transfer/LogAccordion";

type Props = {
  initialTransfer: ITransfer;
};

type FormValues = Pick<ITransfer, "status">;

const TransferDetailsPage: NextPage<Props> = ({ initialTransfer }) => {
  const { signMessage } = useNEVM();
  const [addLogModal, setAddLogModal] = useState<SupportedOperations>();
  const transferUrl = `/api/admin/transfer/${initialTransfer.id}`;
  const { data: transfer, refetch } = useQuery<ITransfer>(
    ["transfer", initialTransfer.id],
    {
      queryFn: async () => {
        const resp = await fetch(transferUrl, {
          headers: {
            "Content-Type": "application/json",
          },
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
            href={`https://explorer.syscoin.org/address/${transfer.nevmAddress}`}
            target="_blank"
            sx={{ ml: 2 }}
          >
            {transfer.nevmAddress}
          </MuiLink>
        </Typography>
        <Typography variant="body1" sx={{ mb: 2 }}>
          UTXO Address:
          <MuiLink
            href={`https://blockbook.elint.services/address/${transfer.utxoAddress}`}
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
        </>
      </Modal>
    </AdminLayoutContainer>
  );
};

export const getServerSideProps: GetServerSideProps = async ({ params }) => {
  if (!params) {
    return {
      notFound: true,
    };
  }

  const id = params["id"];

  if (!id) {
    return {
      notFound: true,
    };
  }

  await dbConnect();

  const transfer = await TransferModel.findOne(
    { id },
    {
      id: 1,
      nevmAddress: 1,
      utxoAddress: 1,
      status: 1,
      type: 1,
      createdAt: 1,
      logs: 1,
    }
  );

  if (!transfer) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      initialTransfer: JSON.parse(JSON.stringify(transfer)),
    },
  };
};

export default TransferDetailsPage;
