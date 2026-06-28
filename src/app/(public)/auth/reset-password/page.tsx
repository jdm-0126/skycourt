"use client";

/**
 * Reset Password page — Task 4.7
 *
 * Collects a new password and calls Supabase updateUser.
 * Supabase automatically establishes a session from the reset link token
 * before this page is rendered (handled by the auth callback or the SSR
 * package's PKCE flow).
 *
 * On success: shows a success message and redirects to /auth/login after 2 s.
 * On error: shows an error alert banner.
 *
 * Requirements: 5.7
 */

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import NextLink from "next/link";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import FormControl from "@mui/material/FormControl";
import FormHelperText from "@mui/material/FormHelperText";
import InputLabel from "@mui/material/InputLabel";
import Link from "@mui/material/Link";
import OutlinedInput from "@mui/material/OutlinedInput";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import { createClient } from "@/lib/supabase/client";

const resetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, "Password must be at least 8 characters"),
});

type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export default function ResetPasswordPage() {
  const router = useRouter();
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const onSubmit = async (data: ResetPasswordInput) => {
    setServerError(null);

    const supabase = createClient();

    const { error } = await supabase.auth.updateUser({
      password: data.password,
    });

    if (error) {
      setServerError(error.message);
      return;
    }

    // Req 5.7 — password updated; redirect to login after 2 seconds
    setSuccess(true);
    setTimeout(() => {
      router.push("/auth/login");
    }, 2000);
  };

  if (success) {
    return (
      <Container maxWidth="sm" sx={{ mt: 10 }}>
        <Paper elevation={0} sx={{ p: 4, border: "1px solid", borderColor: "divider" }}>
          <Alert severity="success" sx={{ mb: 2 }}>
            Password updated successfully
          </Alert>
          <Typography variant="body2" color="text.secondary">
            Your password has been changed. You&apos;ll be redirected to the login page
            in a moment.
          </Typography>
          <Box sx={{ mt: 3, textAlign: "center" }}>
            <Link component={NextLink} href="/auth/login" underline="hover">
              Go to Login
            </Link>
          </Box>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ mt: 10, mb: 4 }}>
      <Paper elevation={0} sx={{ p: 4, border: "1px solid", borderColor: "divider" }}>
        {/* Page heading */}
        <Typography variant="h5" component="h1" gutterBottom fontWeight={700}>
          Set a new password
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Choose a new password for your Sky Court account.
        </Typography>

        {/* Generic server error banner */}
        {serverError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {serverError}
          </Alert>
        )}

        {/* Reset password form */}
        {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
        <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
          {/* New password — Req 5.7 */}
          <FormControl
            fullWidth
            error={Boolean(errors.password)}
            sx={{ mb: 3 }}
          >
            <InputLabel htmlFor="password">New Password</InputLabel>
            <OutlinedInput
              id="password"
              label="New Password"
              type="password"
              autoComplete="new-password"
              autoFocus
              {...register("password")}
            />
            {errors.password && (
              <FormHelperText error>{errors.password.message}</FormHelperText>
            )}
          </FormControl>

          {/* Submit */}
          <Button
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
            size="large"
            disabled={isSubmitting}
            sx={{ mb: 2 }}
          >
            {isSubmitting ? "Updating password…" : "Update Password"}
          </Button>

          {/* Back to Login */}
          <Typography variant="body2" align="center" color="text.secondary">
            <Link component={NextLink} href="/auth/login" underline="hover">
              Back to Login
            </Link>
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
}
