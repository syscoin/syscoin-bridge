import { usePaliWalletV2 } from "@contexts/PaliWallet/usePaliWallet";
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
              : undefined
          }
        >
          <ListItemText primary={label} />
        </ListItemButton>
      </Link>
    </ListItem>
  );
};

const Navigation: React.FC = () => {
  const { version } = usePaliWalletV2();
  const routes: INavigationItem[] = [
    {
      label: "New Transfer",
      path: `/bridge/${version === "v2" ? "v2/" : ""}${Date.now()}`,
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
