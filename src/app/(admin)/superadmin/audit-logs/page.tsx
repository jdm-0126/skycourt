import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import AuditLogsClient, { type AuditLogEntry } from "./AuditLogsClient";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Audit Logs",
  description: "View the full audit trail of system actions and events.",
};

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

async function fetchRecentAuditLogs(): Promise<AuditLogEntry[]> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("audit_logs")
    .select("*, users(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error(
      "[SuperAdminAuditLogs] Failed to fetch audit logs:",
      error.message
    );
    return [];
  }

  return (data ?? []) as AuditLogEntry[];
}

// ---------------------------------------------------------------------------
// Super Admin — Audit Logs Page (Server Component Shell)
//
// Fetches the most recent audit log entries server-side, then hands off to
// AuditLogsClient for interactive filtering.
//
// Requirements: 20.1, 20.2, 20.3
// ---------------------------------------------------------------------------

export default async function SuperAdminAuditLogsPage() {
  // Auth guard — middleware protects this route, but verify defensively
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/auth/login");
  }

  const entries = await fetchRecentAuditLogs();

  return (
    <Box component="article" aria-label="Super admin — audit logs">
      {/* ===================================================================
          Page Header
      =================================================================== */}
      <Box
        component="header"
        sx={{
          background:
            "linear-gradient(135deg, #1a237e 0%, #283593 50%, #3949ab 100%)",
          color: "#fff",
          py: { xs: 4, md: 5 },
          px: 2,
        }}
      >
        <Container maxWidth="xl">
          <Typography
            variant="overline"
            component="p"
            sx={{
              color: "rgba(255,255,255,0.75)",
              fontWeight: 700,
              letterSpacing: 2,
              mb: 0.5,
            }}
          >
            Super Admin
          </Typography>
          <Typography
            variant="h4"
            component="h1"
            fontWeight={800}
            sx={{ textShadow: "0 2px 8px rgba(0,0,0,0.2)" }}
          >
            Audit Logs
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: "rgba(255,255,255,0.8)", mt: 0.5 }}
          >
            Full audit trail of system actions — filter by date, user, or
            action type.
          </Typography>
        </Container>
      </Box>

      {/* ===================================================================
          Content
      =================================================================== */}
      <Box sx={{ py: { xs: 3, md: 4 } }}>
        <Container maxWidth="xl">
          <AuditLogsClient initialEntries={entries} />
        </Container>
      </Box>
    </Box>
  );
}
