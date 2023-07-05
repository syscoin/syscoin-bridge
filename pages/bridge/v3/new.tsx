import { Container, Typography } from "@mui/material";
import DrawerPage from "components/DrawerPage";
import { INavigationItem } from "components/Navigation/Item";
import { NextPage } from "next";

const routes: INavigationItem[] = [
  {
    label: "New Transfer",
    path: `/bridge/v3/new`,
  },
  {
    label: "My Transfers",
    path: "/transfers",
  },
  {
    label: "FAQ",
    path: "/#faq",
  },
];

const BridgeV3New: NextPage = () => {
  return (
    <DrawerPage routes={routes}>
      <Container>
        <Typography>New Transfer</Typography>
        <form></form>
      </Container>
    </DrawerPage>
  );
};

export default BridgeV3New;
