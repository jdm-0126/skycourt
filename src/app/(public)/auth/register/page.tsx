"use client";

/**
 * Register page — Task 4.1
 *
 * Client component that renders the Sky Court registration form.
 * Uses React Hook Form + Zod (registerSchema) for validation.
 * Calls Supabase signUp with full_name and role stored in user_metadata.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import NextLink from "next/link";
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
import Alert from "@mui/material/Alert";

import { registerSchema, type RegisterInput } from "@/lib/validation/register";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterInput) => {
    setServerError(null);

    const supabase = createClient();

    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          full_name: data.fullName,
          role: "member",
        },
      },
    });

    if (error) {
      // Map Supabase error messages to inline field errors or a general banner.
      const msg = error.message.toLowerCase();

      if (
        msg.includes("already registered") ||
        msg.includes("user already registered") ||
        msg.includes("already in use") ||
        msg.includes("email address is already") ||
        msg.includes("duplicate")
      ) {
        // Req 4.3 — duplicate email → inline error on email field
        setError("email", {
          type: "server",
          message: "This email is already in use",
        });
      } else if (
        msg.includes("password") &&
        (msg.includes("short") || msg.includes("characters") || msg.includes("weak"))
      ) {
        // Req 4.4 — password too short (Supabase server-side check)
        setError("password", {
          type: "server",
          message: "Password must be at least 8 characters",
        });
      } else {
        // Generic fallback banner
        setServerError(error.message);
      }
      return;
    }

    // Req 4.6 — verification email sent; show success message (Req 4.2)
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <Container maxWidth="sm" sx={{ mt: 10 }}>
        <Paper elevation={0} sx={{ p: 4, border: "1px solid", borderColor: "divider" }}>
          <Alert severity="success" sx={{ mb: 2 }}>
            Check your email to verify your account
          </Alert>
          <Typography variant="body2" color="text.secondary">
            We&apos;ve sent a verification link to your email address. Please click it to
            activate your account before logging in.
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
          Create your account
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Join Sky Court and start booking pickleball courts today.
        </Typography>

        {/* Generic server error banner */}
        {serverError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {serverError}
          </Alert>
        )}

        {/* Registration form */}
        {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
        <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
          {/* Full Name — Req 4.1 */}
          <FormControl
            fullWidth
            error={Boolean(errors.fullName)}
            sx={{ mb: 2 }}
          >
            <InputLabel htmlFor="fullName">Full Name</InputLabel>
            <OutlinedInput
              id="fullName"
              label="Full Name"
              autoComplete="name"
              autoFocus
              {...register("fullName")}
            />
            {errors.fullName && (
              <FormHelperText error>{errors.fullName.message}</FormHelperText>
            )}
          </FormControl>

          {/* Email — Req 4.1, 4.3 */}
          <FormControl
            fullWidth
            error={Boolean(errors.email)}
            sx={{ mb: 2 }}
          >
            <InputLabel htmlFor="email">Email Address</InputLabel>
            <OutlinedInput
              id="email"
              label="Email Address"
              type="email"
              autoComplete="email"
              {...register("email")}
            />
            {errors.email && (
              <FormHelperText error>{errors.email.message}</FormHelperText>
            )}
          </FormControl>

          {/* Password — Req 4.1, 4.4 */}
          <FormControl
            fullWidth
            error={Boolean(errors.password)}
            sx={{ mb: 3 }}
          >
            <InputLabel htmlFor="password">Password</InputLabel>
            <OutlinedInput
              id="password"
              label="Password"
              type="password"
              autoComplete="new-password"
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
            {isSubmitting ? "Creating account…" : "Create Account"}
          </Button>

          {/* Link to Login */}
          <Typography variant="body2" align="center" color="text.secondary">
            Already have an account?{" "}
            <Link component={NextLink} href="/auth/login" underline="hover">
              Log in
            </Link>
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
}
