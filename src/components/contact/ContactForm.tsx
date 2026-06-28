"use client";

/**
 * ContactForm — Task 6.5
 *
 * Client component that renders the contact form with React Hook Form + Zod.
 * Uses the `contactSchema` for validation (name, email, message).
 * POSTs to `/api/contact`; shows inline errors and a success confirmation.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import FormHelperText from "@mui/material/FormHelperText";
import InputLabel from "@mui/material/InputLabel";
import OutlinedInput from "@mui/material/OutlinedInput";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

import { contactSchema, type ContactInput } from "@/lib/validation/contact";

export default function ContactForm() {
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
  });

  const onSubmit = async (data: ContactInput) => {
    setServerError(null);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Map camelCase schema fields to snake_case API fields
        body: JSON.stringify({
          sender_name: data.senderName,
          sender_email: data.senderEmail,
          message: data.message,
        }),
      });

      if (response.ok) {
        // Req 3.5 — show confirmation on success
        setSubmitted(true);
        reset();
        return;
      }

      // Handle non-OK responses
      let errorMsg = "Something went wrong. Please try again.";
      try {
        const json = (await response.json()) as { error?: string };
        if (json.error) errorMsg = json.error;
      } catch {
        // ignore JSON parse errors
      }
      setServerError(errorMsg);
    } catch {
      setServerError("Unable to send your message. Please check your connection and try again.");
    }
  };

  // Req 3.5 — confirmation message shown after successful submission
  if (submitted) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          py: 6,
          textAlign: "center",
        }}
        role="status"
        aria-live="polite"
      >
        <CheckCircleIcon sx={{ fontSize: 56, color: "success.main" }} aria-hidden="true" />
        <Typography variant="h6" fontWeight={700} color="success.main">
          Your message has been sent!
        </Typography>
        <Typography variant="body2" color="text.secondary">
          We&apos;ll get back to you as soon as possible.
        </Typography>
        <Button
          variant="outlined"
          color="primary"
          onClick={() => setSubmitted(false)}
          sx={{ mt: 1 }}
        >
          Send another message
        </Button>
      </Box>
    );
  }

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 3, sm: 4 },
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 3,
      }}
    >
      <Typography variant="h6" component="h2" fontWeight={700} sx={{ mb: 3 }}>
        Send Us a Message
      </Typography>

      {/* Generic server error banner */}
      {serverError && (
        <Alert severity="error" sx={{ mb: 2 }} role="alert">
          {serverError}
        </Alert>
      )}

      {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
      <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
        {/* Name — Req 3.1, 3.3 */}
        <FormControl fullWidth error={Boolean(errors.senderName)} sx={{ mb: 2 }}>
          <InputLabel htmlFor="senderName">Your Name</InputLabel>
          <OutlinedInput
            id="senderName"
            label="Your Name"
            autoComplete="name"
            inputProps={{ "aria-describedby": errors.senderName ? "senderName-error" : undefined }}
            {...register("senderName")}
          />
          {errors.senderName && (
            <FormHelperText error id="senderName-error">
              {errors.senderName.message}
            </FormHelperText>
          )}
        </FormControl>

        {/* Email — Req 3.1, 3.3, 3.4 */}
        <FormControl fullWidth error={Boolean(errors.senderEmail)} sx={{ mb: 2 }}>
          <InputLabel htmlFor="senderEmail">Email Address</InputLabel>
          <OutlinedInput
            id="senderEmail"
            label="Email Address"
            type="email"
            autoComplete="email"
            inputProps={{ "aria-describedby": errors.senderEmail ? "senderEmail-error" : undefined }}
            {...register("senderEmail")}
          />
          {errors.senderEmail && (
            <FormHelperText error id="senderEmail-error">
              {errors.senderEmail.message}
            </FormHelperText>
          )}
        </FormControl>

        {/* Message — Req 3.1, 3.3 */}
        <FormControl fullWidth error={Boolean(errors.message)} sx={{ mb: 3 }}>
          <InputLabel htmlFor="message">Message</InputLabel>
          <OutlinedInput
            id="message"
            label="Message"
            multiline
            rows={5}
            inputProps={{ "aria-describedby": errors.message ? "message-error" : undefined }}
            {...register("message")}
          />
          {errors.message && (
            <FormHelperText error id="message-error">
              {errors.message.message}
            </FormHelperText>
          )}
        </FormControl>

        {/* Submit — Req 3.2 */}
        <Button
          type="submit"
          variant="contained"
          color="primary"
          fullWidth
          size="large"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Sending…" : "Send Message"}
        </Button>
      </Box>
    </Paper>
  );
}
