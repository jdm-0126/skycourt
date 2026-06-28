"use client";

/**
 * ProfileForm — Client Component
 *
 * React Hook Form + Zod (profileSchema) form for updating a member's
 * full name and contact number. Calls PATCH /api/users/:userId/profile
 * on submit; shows a success Alert on success and inline FormHelperText
 * errors on validation failures.
 *
 * Requirements: 9.1, 9.2, 9.3
 */

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import FormControl from "@mui/material/FormControl";
import FormHelperText from "@mui/material/FormHelperText";
import InputLabel from "@mui/material/InputLabel";
import OutlinedInput from "@mui/material/OutlinedInput";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import SaveIcon from "@mui/icons-material/Save";

import { profileSchema, type ProfileInput } from "@/lib/validation/profile";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ProfileFormProps {
  userId: string;
  initialFullName: string;
  initialContactNumber: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProfileForm({
  userId,
  initialFullName,
  initialContactNumber,
}: ProfileFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: initialFullName,
      contactNumber: initialContactNumber,
    },
  });

  // -------------------------------------------------------------------------
  // Submit handler — calls PATCH /api/users/:id/profile
  // -------------------------------------------------------------------------
  const onSubmit = async (data: ProfileInput) => {
    setServerError(null);
    setSuccess(false);

    try {
      const response = await fetch(`/api/users/${userId}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (response.ok) {
        // Req 9.2 — show success message
        setSuccess(true);
        return;
      }

      let errorMsg = "Something went wrong. Please try again.";
      try {
        const json = (await response.json()) as { error?: string };
        if (json.error) errorMsg = json.error;
      } catch {
        // ignore JSON parse errors
      }
      setServerError(errorMsg);
    } catch {
      setServerError(
        "Unable to update profile. Please check your connection and try again."
      );
    }
  };

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 3, sm: 4 },
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 3,
        maxWidth: 560,
      }}
    >
      <Typography variant="h6" component="h2" fontWeight={700} sx={{ mb: 3 }}>
        Edit Profile
      </Typography>

      {/* Success feedback — Req 9.2 */}
      <Collapse in={success}>
        <Alert
          severity="success"
          sx={{ mb: 2 }}
          role="status"
          aria-live="polite"
          onClose={() => setSuccess(false)}
        >
          Profile updated successfully
        </Alert>
      </Collapse>

      {/* Server-level error banner */}
      {serverError && (
        <Alert severity="error" sx={{ mb: 2 }} role="alert">
          {serverError}
        </Alert>
      )}

      {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
      <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
        {/* Full Name — Req 9.1, 9.3 */}
        <FormControl
          fullWidth
          error={Boolean(errors.fullName)}
          sx={{ mb: 2.5 }}
        >
          <InputLabel htmlFor="fullName">Full Name *</InputLabel>
          <OutlinedInput
            id="fullName"
            label="Full Name *"
            autoComplete="name"
            inputProps={{
              "aria-describedby": errors.fullName ? "fullName-error" : undefined,
            }}
            {...register("fullName")}
          />
          {/* Inline error — Req 9.3 */}
          {errors.fullName && (
            <FormHelperText error id="fullName-error">
              {errors.fullName.message}
            </FormHelperText>
          )}
        </FormControl>

        {/* Contact Number — Req 9.1 (optional field) */}
        <FormControl
          fullWidth
          error={Boolean(errors.contactNumber)}
          sx={{ mb: 3 }}
        >
          <InputLabel htmlFor="contactNumber">Contact Number</InputLabel>
          <OutlinedInput
            id="contactNumber"
            label="Contact Number"
            type="tel"
            autoComplete="tel"
            inputProps={{
              "aria-describedby": errors.contactNumber
                ? "contactNumber-error"
                : undefined,
            }}
            {...register("contactNumber")}
          />
          {errors.contactNumber && (
            <FormHelperText error id="contactNumber-error">
              {errors.contactNumber.message}
            </FormHelperText>
          )}
        </FormControl>

        {/* Submit — Req 9.2 */}
        <Button
          type="submit"
          variant="contained"
          color="primary"
          size="large"
          startIcon={<SaveIcon />}
          disabled={isSubmitting || !isDirty}
          aria-label="Save profile changes"
          sx={{ minWidth: 160 }}
        >
          {isSubmitting ? "Saving…" : "Save Changes"}
        </Button>
      </Box>
    </Paper>
  );
}
