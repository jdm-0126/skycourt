import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";

import { createClient } from "@/lib/supabase/server";
import { WebsiteContentEditor } from "@/components/admin/WebsiteContentEditor";
import type { ContentSection } from "@/components/admin/WebsiteContentEditor";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Website Content",
  description: "Edit the public website content: hero, about, contact, hours, rates, and FAQ.",
};

// ---------------------------------------------------------------------------
// The six editable sections, in display order
// ---------------------------------------------------------------------------

const SECTIONS: ContentSection[] = [
  "hero",
  "about",
  "contact",
  "hours",
  "rates",
  "faq",
];

// ---------------------------------------------------------------------------
// Admin Website Page — Server Component
//
// Requirements: 13.1, 13.2, 13.3
// ---------------------------------------------------------------------------

export default async function AdminWebsitePage() {
  // -------------------------------------------------------------------------
  // Auth guard
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
  // Render
  // -------------------------------------------------------------------------
  return (
    <Box component="article" aria-label="Website content management">
      {/* ===================================================================
          Page Header — same gradient style as admin dashboard
      ==================================================================== */}
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
            Website Content
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: "rgba(255,255,255,0.8)", mt: 0.5 }}
          >
            Edit the public-facing website sections below. Changes are saved
            immediately and reflected on the live site.
          </Typography>
        </Container>
      </Box>

      {/* =====================================================================
          Section editors — one card per section (Requirements 13.1, 13.2, 13.3)
      ===================================================================== */}
      <Box sx={{ py: { xs: 3, md: 4 } }}>
        <Container maxWidth="lg">
          <Stack spacing={4}>
            {SECTIONS.map((section) => (
              <WebsiteContentEditor key={section} section={section} />
            ))}
          </Stack>
        </Container>
      </Box>
    </Box>
  );
}
