import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import AdminCourtsClient, { type AdminCourt } from "./AdminCourtsClient";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Courts",
  description: "View and manage courts, operating hours, and unavailable dates.",
};

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

async function fetchAllCourts(): Promise<AdminCourt[]> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("courts")
    .select("*, court_unavailable_dates(*)")
    .order("name", { ascending: true });

  if (error) {
    console.error("[AdminCourts] Failed to fetch courts:", error.message);
    return [];
  }

  return (data ?? []) as AdminCourt[];
}

// ---------------------------------------------------------------------------
// Admin Courts Page — Server Component Shell
//
// Fetches initial courts server-side, then hands off to AdminCourtsClient
// for interactive CRUD operations and status toggling.
//
// Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
// ---------------------------------------------------------------------------

export default async function AdminCourtsPage() {
  // Auth guard — middleware protects the route, but verify defensively
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/auth/login");
  }

  const courts = await fetchAllCourts();

  return (
    <Box component="article" aria-label="Admin courts management">
      {/* ===================================================================
          Page Header
      =================================================================== */}
      <Box
        component="header"
        sx={{
          background:
            "linear-gradient(135deg, #1b5e20 0%, #2e7d32 50%, #43a047 100%)",
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
            Admin Panel
          </Typography>
          <Typography
            variant="h4"
            component="h1"
            fontWeight={800}
            sx={{ textShadow: "0 2px 8px rgba(0,0,0,0.2)" }}
          >
            Courts
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: "rgba(255,255,255,0.8)", mt: 0.5 }}
          >
            Manage courts, operating hours, status, and unavailable dates.
          </Typography>
        </Container>
      </Box>

      {/* ===================================================================
          Content
      =================================================================== */}
      <Box sx={{ py: { xs: 3, md: 4 } }}>
        <Container maxWidth="xl">
          <AdminCourtsClient initialCourts={courts} />
        </Container>
      </Box>
    </Box>
  );
}
