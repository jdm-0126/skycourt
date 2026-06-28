"use client";

/**
 * Login page — Task 4.4
 *
 * Client component that renders the Sky Court login form.
 * Uses React Hook Form + Zod (loginSchema) for validation.
 * Calls Supabase signInWithPassword; reads role from session metadata
 * and redirects to the role-appropriate dashboard.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 *
 * NOTE: useSearchParams() must be used inside a component wrapped in
 * <Suspense> to avoid the Next.js CSR bail-out prerender error.
 * LoginForm handles the search params; LoginPage wraps it in Suspense.
 */

import React, { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
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
import CircularProgress from "@mui/material/CircularProgress";

import { loginSchema, type LoginInput } from "@/lib/validation/login";
import { createClient } from "@/lib/supabase/client";
import { dashboardForRole } from "@/lib/auth/dashboard-redirect";

// ---------------------------------------------------------------------------
// LoginForm — contains useSearchParams(); must be inside <Suspense>
// ---------------------------------------------------------------------------

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isVerified = searchParams.get("verified") === "1";
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginInput) => {
    setServerError(null);

    const supabase = createClient();

    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      const msg = error.message.toLowerCase();

      if (
        msg.includes("email not confirmed") ||
        msg.includes("not confirmed") ||
        msg.includes("confirm your email") ||
        msg.includes("email_not_confirmed")
      ) {
        // Req 5.4 — unverified account
        setServerError("Please verify your email before logging in");
      } else {
        // Req 5.3 — invalid credentials (catch-all for wrong email / password)
        setServerError("Email or password is incorrect");
      }
      return;
    }

    // Req 5.2 — successful login; redirect to role-appropriate dashboard
    const session = authData.session;
    const appMeta = (session?.user?.app_metadata ?? {}) as Record<string, unknown>;
    const userMeta = (session?.user?.user_metadata ?? {}) as Record<string, unknown>;
    const destination = dashboardForRole(appMeta, userMeta);

    router.push(destination);
  };

  return (
    <Paper elevation={0} sx={{ p: 4, border: "1px solid", borderColor: "divider" }}>
      {/* Page heading */}
      <Typography variant="h5" component="h1" gutterBottom fontWeight={700}>
        Log in to Sky Court
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Welcome back! Enter your credentials to continue.
      </Typography>

      {/* Email verified success banner — Req 4.7 */}
      {isVerified && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Email verified! You can now log in.
        </Alert>
      )}

      {/* Server error banner — Req 5.3, 5.4 */}
      {serverError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {serverError}
        </Alert>
      )}

      {/* Login form */}
      {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
      <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
        {/* Email — Req 5.1 */}
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
            autoFocus
            {...register("email")}
          />
          {errors.email && (
            <FormHelperText error>{errors.email.message}</FormHelperText>
          )}
        </FormControl>

        {/* Password — Req 5.1 */}
        <FormControl
          fullWidth
          error={Boolean(errors.password)}
          sx={{ mb: 1 }}
        >
          <InputLabel htmlFor="password">Password</InputLabel>
          <OutlinedInput
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            {...register("password")}
          />
          {errors.password && (
            <FormHelperText error>{errors.password.message}</FormHelperText>
          )}
        </FormControl>

        {/* Forgot Password link — Req 5.5 */}
        <Box sx={{ textAlign: "right", mb: 3 }}>
          <Link
            component={NextLink}
            href="/auth/forgot-password"
            underline="hover"
            variant="body2"
          >
            Forgot Password?
          </Link>
        </Box>

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
          {isSubmitting ? "Logging in…" : "Log In"}
        </Button>

        {/* Link to Register */}
        <Typography variant="body2" align="center" color="text.secondary">
          Don&apos;t have an account?{" "}
          <Link component={NextLink} href="/auth/register" underline="hover">
            Create one
          </Link>
        </Typography>
      </Box>
    </Paper>
  );
}

// ---------------------------------------------------------------------------
// LoginPage — wraps LoginForm in Suspense so Next.js can prerender the shell
// ---------------------------------------------------------------------------

export default function LoginPage() {
  return (
    <Container maxWidth="sm" sx={{ mt: 10, mb: 4 }}>
      <Suspense
        fallback={
          <Paper
            elevation={0}
            sx={{
              p: 4,
              border: "1px solid",
              borderColor: "divider",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              minHeight: 300,
            }}
          >
            <CircularProgress size={32} aria-label="Loading login form" />
          </Paper>
        }
      >
        <LoginForm />
      </Suspense>
    </Container>
  );
}
