import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import AdminUsersClient, { type AdminUser } from "./AdminUsersClient";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Users",
  description: "View and manage member accounts — activate or deactivate access.",
};

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

async function fetchAllUsers(): Promise<AdminUser[]> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("users")
    .select(
      "id, full_name, email, role, status, contact_number, created_at, updated_at"
    )
    .eq("role", "member")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[AdminUsers] Failed to fetch users:", error.message);
    return [];
  }

  return (data ?? []) as AdminUser[];
}

// ---------------------------------------------------------------------------
// Admin Users Page — Server Component Shell
//
// Fetches the initial user list server-side, then hands off to
// AdminUsersClient for interactive activate/deactivate actions.
//
// Requirements: 17.1, 17.2, 17.3
// ---------------------------------------------------------------------------

export default async function AdminUsersPage() {
  // Auth guard — middleware protects the route, but verify defensively
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/auth/login");
  }

  const users = await fetchAllUsers();

  return (
    <Box component="article" aria-label="Admin users management">
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
            Users
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: "rgba(255,255,255,0.8)", mt: 0.5 }}
          >
            View member accounts and manage their access status.
          </Typography>
        </Container>
      </Box>

      {/* ===================================================================
          Content
      =================================================================== */}
      <Box sx={{ py: { xs: 3, md: 4 } }}>
        <Container maxWidth="xl">
          <AdminUsersClient initialUsers={users} />
        </Container>
      </Box>
    </Box>
  );
}
