import { ITransferLog } from "@contexts/Transfer/types";
import { Delete } from "@mui/icons-material";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  IconButton,
  Typography,
} from "@mui/material";
import { GridExpandMoreIcon } from "@mui/x-data-grid";
import { useMutation } from "react-query";

type Props = {
  transferId: string;
  log: ITransferLog;
  onDelete: () => void;
};

const AdminTransferLogAccordion: React.FC<Props> = ({
  transferId,
  log,
  onDelete,
}) => {
  const { mutate: deleteLog, isLoading: isDeleting } = useMutation(
    ["admin", "transfer", "log", "delete", log.date],
    async () => {
      const resp = await fetch(
        `/api/admin/transfer/${transferId}/log/${log.date}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return resp.json();
    },
    {
      onSuccess: onDelete,
    }
  );
  return (
    <Accordion key={log.date}>
      <AccordionSummary expandIcon={<GridExpandMoreIcon />}>
        <Typography variant="body1" lineHeight="2.5rem">
          {log.payload.message} - ({log.status})
          {new Date(log.date).toLocaleString()}
        </Typography>
        <IconButton onClick={() => deleteLog()} disabled={isDeleting}>
          <Delete />
        </IconButton>
      </AccordionSummary>
      <AccordionDetails>
        <Box
          component="pre"
          sx={{
            overflow: "auto",
            border: "1px solid #aaaa",
            borderRadius: "1rem",
            padding: "1rem",
            backgroundColor: "#202020",
            color: " #0ee40e",
            maxHeight: "20rem",
          }}
        >
          {JSON.stringify(log.payload, null, 2)}
        </Box>
      </AccordionDetails>
    </Accordion>
  );
};

export default AdminTransferLogAccordion;
