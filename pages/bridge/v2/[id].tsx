import { usePaliWallet } from "@contexts/PaliWallet/usePaliWallet";
import { CircularProgress, Container } from "@mui/material";
import BlocktimeDisclaimer from "components/BlocktimeDisclaimer";
import DrawerPage from "components/DrawerPage";
import { NextPage } from "next";
import { useRouter } from "next/router";

const Bridge: NextPage = () => {
  const router = useRouter();
  const paliWallet = usePaliWallet();
  const { id } = router.query;

  if (!id) {
    return <CircularProgress />;
  }

  return (
    <DrawerPage>
      <BlocktimeDisclaimer />
      <Container sx={{ mt: 10 }}></Container>
    </DrawerPage>
  );
};

export default Bridge;
