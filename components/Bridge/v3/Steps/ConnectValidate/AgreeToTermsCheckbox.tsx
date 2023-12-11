import { Box, Checkbox, FormControlLabel, Typography } from "@mui/material";
import Link from "next/link";
import { useFormContext } from "react-hook-form";

export const ConnectValidateAgreeToTermsCheckbox = () => {
  const { register } = useFormContext();
  return (
    <Box>
      <FormControlLabel
        control={
          <Checkbox
            {...register("agreedToTerms", { required: true })}
            color="primary"
          ></Checkbox>
        }
        label={
          <Typography variant="body1">
            I agree to the{" "}
            <Typography
              component={Link}
              color="primary"
              target="_blank"
              href="/Syscoin Terms and Conditions.pdf"
            >
              terms and conditions.
            </Typography>
          </Typography>
        }
      />
    </Box>
  );
};
