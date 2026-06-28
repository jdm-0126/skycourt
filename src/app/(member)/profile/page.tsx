import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";

import { createClient } from "@/lib/supabase/server";
import ProfileForm from "@/components/member/ProfileForm";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "My Profile — Sky Court Pickleball",
  description: "Update your Sky Court member profile: full name and contact number.",
};

// ---------------------------------------------------------------------------
// Member Profile Page — Server Component
//
// Fetches the authenticated member's profile from the users table, then
// renders the ProfileForm client component pre-filled with current values.
//
// The (member) route group is protected by middleware — only authenticated
// members, admins, and super_admins reach this page (Requirement 6.1).
//
// Requirements: 9.1, 9.2, 9.3
// ---------------------------------------------------------------------------

export default async function ProfilePage() {
  // -------------------------------------------------------------------------
  // 1. Resolve the authenticated user
  // -------------------------------------------------------------------------
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/auth/login");
  }

  // -------------------------------------------------------------------------
  // 2. Fetch current profile from users table
  // -------------------------------------------------------------------------
  type ProfileRow = { full_name: string; contact_number: string | null };

  const { data: profileData, error: profileError } = await supabase
    .from("users")
    .select("full_name, contact_number")
    .eq("id", user.id)
    .returns<ProfileRow[]>()
    .single();

  if (profileError) {
    // Non-fatal: fall back to empty values so the form still renders
    console.error("[ProfilePage] Failed to fetch profile:", profileError.message);
  }

  const initialFullName = (profileData as ProfileRow | null)?.full_name ?? "";
  const initialContactNumber =
    (profileData as ProfileRow | null)?.contact_number ?? "";

  // -------------------------------------------------------------------------
  // 3. Render
  // -------------------------------------------------------------------------
  return (
    <Box component="main">
      {/* ===================================================================
          Page Header — matches Member Dashboard green gradient style
      ==================================================================== */}
      <Box
        component="section"
        aria-label="Page header"
        sx={{
          background:
            "linear-gradient(135deg, #1b5e20 0%, #2e7d32 50%, #43a047 100%)",
          color: "#fff",
          py: { xs: 5, md: 7 },
          px: 2,
        }}
      >
        <Container maxWidth="lg">
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
            Member Portal
          </Typography>
          <Typography
            variant="h3"
            component="h1"
            sx={{
              fontWeight: 800,
              fontSize: { xs: "1.8rem", sm: "2.4rem", md: "2.8rem" },
              textShadow: "0 2px 8px rgba(0,0,0,0.2)",
            }}
          >
            My Profile
          </Typography>
          <Typography
            variant="body1"
            sx={{ color: "rgba(255,255,255,0.85)", mt: 1 }}
          >
            Keep your account details up to date.
          </Typography>
        </Container>
      </Box>

      {/* ===================================================================
          Profile Form Content
      ==================================================================== */}
      <Box
        component="section"
        aria-label="Profile settings"
        sx={{ bgcolor: "background.default", py: { xs: 4, md: 6 } }}
      >
        <Container maxWidth="lg">
          <Box sx={{ mb: 3 }}>
            <Typography
              variant="h5"
              component="h2"
              fontWeight={700}
              gutterBottom
            >
              Account Details
            </Typography>
            <Divider />
          </Box>

          {/* Email display (read-only — managed by Supabase Auth) */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Email address
            </Typography>
            <Typography variant="body1" fontWeight={500}>
              {user.email ?? "—"}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Your email address is managed through your login credentials and cannot be changed here.
            </Typography>
          </Box>

          <Divider sx={{ mb: 3 }} />

          {/* ProfileForm — Req 9.1, 9.2, 9.3 */}
          <ProfileForm
            userId={user.id}
            initialFullName={initialFullName}
            initialContactNumber={initialContactNumber}
          />
        </Container>
      </Box>
    </Box>
  );
}
