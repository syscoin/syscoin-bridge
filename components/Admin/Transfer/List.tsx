import { ITransfer } from "@contexts/Transfer/types";
import { Typography } from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import { TRANSFER_COLUMNS } from "components/Transfer/columns";
import Link from "next/link";

const AdminTransferList: React.FC<{
  transfers: ITransfer[];
  total: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  onSortChange?: (sort: string) => void;
}> = ({ transfers, total, onPageChange, pageSize }) => {
  return (
    <DataGrid
      columns={[
        {
          field: "id",
          headerName: "ID",
          sortable: false,
          renderCell: (params) => (
            <Link href={`/admin/transfer/${params.value}`}>
              <Typography variant="body1" color="primary">
                {params.value}
              </Typography>
            </Link>
          ),
        },
        ...TRANSFER_COLUMNS,
      ]}
      rows={transfers ?? []}
      rowCount={total}
      paginationMode="server"
      pageSize={pageSize}
      pagination
      onPageChange={onPageChange}
      sortingMode="server"
      filterMode="server"
      onFilterModelChange={(filter) => console.log({ filter })}
    />
  );
};

export default AdminTransferList;
