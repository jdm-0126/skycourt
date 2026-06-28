"use client";

/**
 * CtaButton — client component for the hero call-to-action.
 *
 * Wrapped in a React error boundary so that any navigation failure
 * (network error, missing route, hydration crash) shows a user-friendly
 * error message with a "Try again" retry option.
 *
 * Requirements: 1.7, 1.8
 */

import React, { Component, type ReactNode } from "react";
import NextLink from "next/link";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";

// ---------------------------------------------------------------------------
// Error Boundary
// ---------------------------------------------------------------------------

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

class CtaErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || "Something went wrong. Please try again.",
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log the error for diagnostics without crashing the boundary.
    console.error("[CtaButton] Navigation error caught by ErrorBoundary:", error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: "" });
  };

  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ mt: 2 }}>
          <Alert severity="error" sx={{ mb: 2, maxWidth: 420, mx: "auto" }}>
            {this.state.errorMessage}
          </Alert>
          <Button
            variant="outlined"
            color="inherit"
            onClick={this.handleRetry}
            sx={{ borderColor: "rgba(255,255,255,0.7)", color: "inherit" }}
          >
            Try again
          </Button>
        </Box>
      );
    }

    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// CtaButton — exported client component
// ---------------------------------------------------------------------------

interface CtaButtonProps {
  /** Button label text, e.g. "Book a Court" or "Get Started" */
  label: string;
}

/**
 * Renders a MUI Button that navigates to /auth/register.
 * The button is wrapped in a CtaErrorBoundary so any rendering or
 * navigation failure shows a friendly "Try again" fallback.
 *
 * Requirements: 1.7, 1.8
 */
export default function CtaButton({ label }: CtaButtonProps) {
  return (
    <CtaErrorBoundary>
      <Button
        component={NextLink}
        href="/auth/register"
        variant="contained"
        size="large"
        color="secondary"
        sx={{
          mt: 3,
          px: 5,
          py: 1.5,
          fontSize: "1.1rem",
          fontWeight: 700,
          bgcolor: "rgba(255,255,255,0.15)",
          color: "#fff",
          border: "2px solid rgba(255,255,255,0.8)",
          backdropFilter: "blur(4px)",
          "&:hover": {
            bgcolor: "rgba(255,255,255,0.25)",
          },
        }}
      >
        {label}
      </Button>
    </CtaErrorBoundary>
  );
}
