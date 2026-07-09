import { GetServerSideProps, NextPage } from "next";
import { SessionUser, withSessionSsr } from "lib/session";
import { Box, Button, Container, Typography } from "@mui/material";
import { useRouter } from "next/navigation";
import AdminTransferList from "components/Admin/Transfer/List";
import { ITransfer } from "@contexts/Transfer/types";
import AdminTransferFilters from "components/Admin/Transfer/Filters";
import { buildApiUrl } from "utils/api-base-url";
type Props = {
  user: SessionUser;
  transfers: ITransfer[];
  total: number;
  pageSize: number;
};

const AdminPage: NextPage<Props> = ({ user, transfers, total, pageSize }) => {
  const { refresh, push } = useRouter();

  const onLogout = () => {
    fetch("/api/admin/logout", {
      credentials: "include",
    }).then((res) => {
      res.ok && refresh();
    });
  };

  const onPageChange = (page: number) => {
    const query = new URLSearchParams(window.location.search);
    query.set("page", page.toString());
    push(`/admin?${query.toString()}`);
  };

  return (
    <Container
      sx={{ py: 4, height: "100vh", display: "flex", flexDirection: "column" }}
    >
      <Box>
        <Typography variant="h5">Admin, {user.name}</Typography>
        <Button variant="contained" onClick={onLogout}>
          Logout
        </Button>
      </Box>
      <AdminTransferFilters />
      <Box
        sx={{
          flex: 1,
          mt: 4,
          bgcolor: "background.paper",
          border: "px solid #000",
        }}
      >
        <AdminTransferList
          transfers={transfers}
          total={total}
          onPageChange={onPageChange}
          pageSize={pageSize}
        />
      </Box>
    </Container>
  );
};

// This gets called on every request
export const getServerSideProps: GetServerSideProps = withSessionSsr(
  async ({ req, query }) => {
    const { user } = req.session;

    if (!user) {
      return {
        redirect: {
          destination: "/admin/login",
          permanent: false,
        },
      };
    }

    const getQueryValue = (value?: string | string[]) =>
      Array.isArray(value) ? value[0] : value;

    const searchParams = new URLSearchParams();
    const id = getQueryValue(query.id);
    const page = getQueryValue(query.page);

    if (id) {
      searchParams.set("id", id);
    }

    if (page) {
      searchParams.set("page", page);
    }

    const forwardedProto = req.headers["x-forwarded-proto"];
    const protocol = (
      Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto
    )?.split(",")[0]?.trim() || "http";
    const host = req.headers.host || "localhost:3000";
    const fallbackOrigin = `${protocol}://${host}`;
    const queryString = searchParams.toString();
    const requestUrl = buildApiUrl(
      `/api/admin/transfers${queryString ? `?${queryString}` : ""}`,
      { fallbackOrigin }
    );

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

    if (!response.ok) {
      throw new Error("Failed to fetch admin transfers");
    }

    const { transfers, total, pageSize } = await response.json();

    const props: Props = {
      user,
      transfers,
      total,
      pageSize,
    };

    return {
      props,
    };
  }
);

export default AdminPage;
