import { Card, CardContent, Container } from "@mui/material";

type BridgeV3LayoutProps = {
  children: React.ReactNode;
};

export const BridgeV3Layout: React.FC<BridgeV3LayoutProps> = ({ children }) => {
  return (
    <Container sx={{ height: "100vh", display: "flex" }}>
      <Card sx={{ my: "auto", width: "100%" }}>
        <CardContent sx={{ display: "flex" }}>{children}</CardContent>
      </Card>{" "}
    </Container>
  );
};
