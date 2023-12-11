import { Box, BoxProps } from "@mui/material";

const AddLogModalContainer: React.FC<BoxProps> = ({ children, ...props }) => {
  return (
    <Box
      {...props}
      sx={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: 400,
        bgcolor: "background.paper",
        borderRadius: 1,
        boxShadow: 24,
        p: 4,
      }}
    >
      {children}
    </Box>
  );
};

export default AddLogModalContainer;
