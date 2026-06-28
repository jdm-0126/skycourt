import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import AdminMessagesClient, { type ContactMessage } from "./AdminMessagesClient";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Messages",
  description: "View and manage contact messages from members and visitors.",
};

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

/**
 * Fetch all non-archived contact messages ordered newest first.
 * Uses the admin client to bypass RLS.
 * Requirement: 15.1
 */
async function fetchMessages(): Promise<ContactMessage[]> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("contact_messages")
    .select("*")
    .neq("status", "archived")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[AdminMessages] Failed to fetch messages:", error.message);
    return [];
  }

  return (data ?? []) as ContactMessage[];
}

// ---------------------------------------------------------------------------
// Admin Messages Page — Server Component Shell
//
// Fetches initial (non-archived) messages server-side, then hands off to
// AdminMessagesClient for interactive inbox toggle and row-level actions.
//
// Requirements: 15.1, 15.2, 15.3
// ---------------------------------------------------------------------------

export default async function AdminMessagesPage() {
  // Auth guard — middleware protects the route, but verify defensively
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/auth/login");
  }

  const messages = await fetchMessages();

  return (
    <Box component="article" aria-label="Admin messages management">
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
            Messages
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: "rgba(255,255,255,0.8)", mt: 0.5 }}
          >
            Manage contact form submissions from members and visitors.
          </Typography>
        </Container>
      </Box>

      {/* ===================================================================
          Content
      =================================================================== */}
      <Box sx={{ py: { xs: 3, md: 4 } }}>
        <Container maxWidth="xl">
          <AdminMessagesClient initialMessages={messages} />
        </Container>
      </Box>
    </Box>
  );
}
