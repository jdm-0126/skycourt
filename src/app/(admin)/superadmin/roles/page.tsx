import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import SuperAdminRolesClient, { type Role } from "./SuperAdminRolesClient";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Roles & Permissions",
  description:
    "Manage role permissions for the system. Guard super_admin core permissions.",
};

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

async function fetchAllRoles(): Promise<Role[]> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("roles")
    .select("id, name, permissions, updated_at")
    .order("name", { ascending: true });

  if (error) {
    console.error("[SuperAdminRoles] Failed to fetch roles:", error.message);
    return [];
  }

  return (data ?? []) as Role[];
}

// ---------------------------------------------------------------------------
// Super Admin — Roles Page (Server Component Shell)
//
// Fetches the initial list of roles server-side, then hands off to
// SuperAdminRolesClient for interactive inline permission editing.
//
// Requirements: 19.1, 19.2, 19.3
// ---------------------------------------------------------------------------

export default async function SuperAdminRolesPage() {
  // Auth guard — middleware protects this route, but verify defensively
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/auth/login");
  }

  const roles = await fetchAllRoles();

  return (
    <Box component="article" aria-label="Super admin — roles and permissions management">
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
            Roles &amp; Permissions
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: "rgba(255,255,255,0.8)", mt: 0.5 }}
          >
            View and update the permissions assigned to each role. Core
            super_admin permissions are locked to prevent system lockout.
          </Typography>
        </Container>
      </Box>

      {/* ===================================================================
          Content
      =================================================================== */}
      <Box sx={{ py: { xs: 3, md: 4 } }}>
        <Container maxWidth="xl">
          <SuperAdminRolesClient initialRoles={roles} />
        </Container>
      </Box>
    </Box>
  );
}
