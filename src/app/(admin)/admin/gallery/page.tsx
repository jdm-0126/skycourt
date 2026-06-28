import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import AdminGalleryClient, { type GalleryImage } from "./AdminGalleryClient";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Gallery",
  description: "Manage gallery images: upload, delete, and reorder photos.",
};

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

async function fetchGalleryImages(): Promise<GalleryImage[]> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("gallery_images")
    .select("*")
    .order("display_order", { ascending: true });

  if (error) {
    console.error("[AdminGallery] Failed to fetch images:", error.message);
    return [];
  }

  return (data ?? []) as GalleryImage[];
}

// ---------------------------------------------------------------------------
// Admin Gallery Page — Server Component Shell
//
// Fetches gallery images server-side, then hands off to AdminGalleryClient
// for interactive upload, delete, and reorder operations.
//
// Requirements: 14.1, 14.2, 14.3, 14.4
// ---------------------------------------------------------------------------

export default async function AdminGalleryPage() {
  // Auth guard — middleware protects the route, but verify defensively
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/auth/login");
  }

  const images = await fetchGalleryImages();

  return (
    <Box component="article" aria-label="Admin gallery management">
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
            Gallery
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: "rgba(255,255,255,0.8)", mt: 0.5 }}
          >
            Upload, delete, and reorder gallery images.
          </Typography>
        </Container>
      </Box>

      {/* ===================================================================
          Content
      =================================================================== */}
      <Box sx={{ py: { xs: 3, md: 4 } }}>
        <Container maxWidth="xl">
          <AdminGalleryClient initialImages={images} />
        </Container>
      </Box>
    </Box>
  );
}
