import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import BackupClient, { type BackupRecord } from "./BackupClient";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Database Backup",
  description:
    "Trigger a manual database backup and view the backup history.",
};

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

async function fetchBackupHistory(): Promise<BackupRecord[]> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("backup_history")
    .select("*, users(full_name, email)")
    .order("started_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error(
      "[SuperAdminBackup] Failed to fetch backup history:",
      error.message
    );
    return [];
  }

  return (data ?? []) as BackupRecord[];
}

// ---------------------------------------------------------------------------
// Super Admin — Database Backup Page (Server Component Shell)
//
// Fetches the initial backup history server-side, then hands off to
// BackupClient for the interactive trigger and history display.
//
// Requirements: 21.1, 21.2, 21.3, 21.4
// ---------------------------------------------------------------------------

export default async function SuperAdminBackupPage() {
  // Auth guard — middleware protects this route, but verify defensively
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/auth/login");
  }

  const history = await fetchBackupHistory();

  return (
    <Box component="article" aria-label="Super admin — database backup">
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
            Database Backup
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: "rgba(255,255,255,0.8)", mt: 0.5 }}
          >
            Trigger a manual backup and monitor backup status and history.
          </Typography>
        </Container>
      </Box>

      {/* ===================================================================
          Content
      =================================================================== */}
      <Box sx={{ py: { xs: 3, md: 4 } }}>
        <Container maxWidth="xl">
          <BackupClient initialHistory={history} />
        </Container>
      </Box>
    </Box>
  );
}
