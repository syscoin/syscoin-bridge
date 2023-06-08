import { useConnectedWallet } from "@contexts/ConnectedWallet/useConnectedWallet";
import { List, ListItem, ListItemButton, ListItemText } from "@mui/material";
import Link from "next/link";
import { useRouter } from "next/router";

interface INavigationItem {
  label: string;
  path: string;
}

const NavigationItem: React.FC<INavigationItem> = ({ label, path }) => {
  const { asPath } = useRouter();
  return (
    <ListItem disablePadding>
      <Link href={path}>
        <ListItemButton
          sx={
            asPath.startsWith(path)
              ? {
                  backgroundColor: "primary.dark",
                  color: "white",
                }
              : {
                  color: "primary.main",
                }
          }
        >
          <ListItemText primary={label} />
        </ListItemButton>
      </Link>
    </ListItem>
  );
};

const Navigation: React.FC = () => {
  const { nevm, utxo } = useConnectedWallet();
  const routes: INavigationItem[] = [
    {
      label: "New Transfer",
      path: `/bridge/${utxo.type === nevm.type ? "v2/" : ""}${Date.now()}`,
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

  return (
    <List>
      {routes.map((route) => (
        <NavigationItem key={route.path} {...route} />
      ))}
    </List>
  );
};

export default Navigation;
