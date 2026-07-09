import {
  Box,
  Checkbox,
  FormControlLabel,
  Typography,
  Link as MUILink,
} from "@mui/material";
import Link from "next/link";
import { Controller, useFormContext } from "react-hook-form";

export const ConnectValidateAgreeToTermsCheckbox = () => {
  const { control } = useFormContext();
  return (
    <Box>
      <FormControlLabel
        control={
          <Controller
            name="agreedToTerms"
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <Checkbox
                checked={Boolean(field.value)}
                color="primary"
                inputRef={field.ref}
                name={field.name}
                onBlur={field.onBlur}
                onChange={(event) => field.onChange(event.target.checked)}
              />
            )}
          />
        }
        label={
          <Typography variant="body1">
            I agree to the{" "}
            <MUILink
              component={Link}
              color="primary"
              target="_blank"
              href="/Syscoin Terms and Conditions.pdf"
            >
              terms and conditions.
            </MUILink>
          </Typography>
        }
      />
    </Box>
  );
};
