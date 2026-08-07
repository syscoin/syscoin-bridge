import { Typography } from "@mui/material";
import { GridColDef } from "@mui/x-data-grid";

const formatStatus = (value: unknown) =>
  String(value)
    .split("-")
    .map((word) => {
      if (["sys", "sysx", "nevm", "utxo"].includes(word)) {
        return word.toUpperCase();
      }
      return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
    })
    .join(" ");

const DateField: React.FC<{ value: number }> = ({ value }) => {
  if (!value) {
    return (
      <Typography variant="body2" color="GrayText">
        —
      </Typography>
    );
  }
  return (
    <Typography variant="body1">{new Date(value).toLocaleString()}</Typography>
  );
};

export const TRANSFER_COLUMNS: GridColDef[] = [
  {
    field: "type",
    headerName: "Route",
    renderCell: ({ value }) =>
      value === "sys-to-nevm" ? "UTXO → NEVM" : "NEVM → UTXO",
  },
  {
    field: "amount",
    headerName: "Amount",
    renderCell: ({ value }) => `${value} SYS`,
  },
  {
    field: "utxoAddress",
    headerName: "UTXO Account",
    width: 320,
  },
  {
    field: "nevmAddress",
    headerName: "NEVM Account",
    width: 300,
  },
  {
    field: "status",
    headerName: "Status",
    renderCell: ({ value }) => {
      let color = "inherit";
      if (value === "completed") {
        color = "green";
      }
      if (value === "error") {
        color = "error";
      }
      return (
        <Typography variant="body1" color={color}>
          {formatStatus(value)}
        </Typography>
      );
    },
  },
  {
    field: "createdAt",
    headerName: "Created",
    width: 200,
    renderCell: ({ value }) => <DateField value={value} />,
  },
  {
    field: "updatedAt",
    headerName: "Updated",
    width: 200,
    renderCell: ({ value }) => <DateField value={value} />,
  },
];
