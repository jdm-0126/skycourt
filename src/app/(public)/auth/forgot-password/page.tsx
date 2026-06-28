"use client";

/**
 * Forgot Password page — Task 4.7
 *
 * Collects the user's email and calls Supabase resetPasswordForEmail.
 * On success: shows a "check your email" confirmation message.
 * On error: shows an error alert banner.
 *
 * Requirements: 5.5, 5.6
 */

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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

const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordInput) => {
    setServerError(null);

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/reset-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo,
    });

    if (error) {
      setServerError(error.message);
      return;
    }

    // Req 5.6 — reset email sent; show success message
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <Container maxWidth="sm" sx={{ mt: 10 }}>
        <Paper elevation={0} sx={{ p: 4, border: "1px solid", borderColor: "divider" }}>
          <Alert severity="success" sx={{ mb: 2 }}>
            Check your email for a password reset link
          </Alert>
          <Typography variant="body2" color="text.secondary">
            We&apos;ve sent a password reset link to your email address. Follow the link
            to choose a new password.
          </Typography>
          <Box sx={{ mt: 3, textAlign: "center" }}>
            <Link component={NextLink} href="/auth/login" underline="hover">
              Back to Login
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
          Forgot your password?
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Enter your email address and we&apos;ll send you a link to reset your password.
        </Typography>

        {/* Generic server error banner */}
        {serverError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {serverError}
          </Alert>
        )}

        {/* Forgot password form */}
        {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
        <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
          {/* Email — Req 5.6 */}
          <FormControl
            fullWidth
            error={Boolean(errors.email)}
            sx={{ mb: 3 }}
          >
            <InputLabel htmlFor="email">Email Address</InputLabel>
            <OutlinedInput
              id="email"
              label="Email Address"
              type="email"
              autoComplete="email"
              autoFocus
              {...register("email")}
            />
            {errors.email && (
              <FormHelperText error>{errors.email.message}</FormHelperText>
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
            {isSubmitting ? "Sending reset link…" : "Send Reset Link"}
          </Button>

          {/* Back to Login — Req 5.5 */}
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
