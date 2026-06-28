import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import WebsiteSettingsClient, {
  type SystemSettings,
} from "./WebsiteSettingsClient";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Website Settings",
  description:
    "Manage global system settings: site name, contact email, and maintenance mode.",
};

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

interface SystemSettingRow {
  key: string;
  value: string;
}

async function fetchSettings(): Promise<SystemSettings> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("system_settings")
    .select("key, value");

  if (error) {
    console.error(
      "[SuperAdminWebsiteSettings] Failed to fetch settings:",
      error.message
    );
    // Return safe defaults so the page still renders
    return {
      site_name: "",
      contact_email: "",
      maintenance_mode: false,
    };
  }

  const rows = (data ?? []) as SystemSettingRow[];
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  return {
    site_name: map["site_name"] ?? "",
    contact_email: map["contact_email"] ?? "",
    maintenance_mode: map["maintenance_mode"] === "true",
  };
}

// ---------------------------------------------------------------------------
// Super Admin — Website Settings Page (Server Component Shell)
//
// Fetches current settings server-side, then hands off to
// WebsiteSettingsClient for the interactive form.
//
// Requirements: 22.1, 22.2, 22.3
// ---------------------------------------------------------------------------

export default async function SuperAdminWebsiteSettingsPage() {
  // Auth guard — middleware protects this route, but verify defensively
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/auth/login");
  }

  const settings = await fetchSettings();

  return (
    <Box component="article" aria-label="Super admin — website settings">
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
            Website Settings
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: "rgba(255,255,255,0.8)", mt: 0.5 }}
          >
            Manage global site configuration including maintenance mode.
          </Typography>
        </Container>
      </Box>

      {/* ===================================================================
          Content
      =================================================================== */}
      <Box sx={{ py: { xs: 3, md: 4 } }}>
        <Container maxWidth="md">
          <WebsiteSettingsClient initialSettings={settings} />
        </Container>
      </Box>
    </Box>
  );
}
