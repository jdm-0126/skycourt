import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import AdminBookingsClient, { type AdminBooking, type CourtOption } from "./AdminBookingsClient";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Bookings",
  description: "View and manage all member bookings.",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"] & {
  courts: { name: string } | null;
  users: { full_name: string; email: string } | null;
};

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

async function fetchAllBookings(): Promise<AdminBooking[]> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("bookings")
    .select("*, courts(name), users(full_name, email)")
    .order("booking_date", { ascending: false })
    .order("start_time",   { ascending: false });

  if (error) {
    console.error("[AdminBookings] Failed to fetch bookings:", error.message);
    return [];
  }

  return (data ?? []) as AdminBooking[];
}

async function fetchCourts(): Promise<CourtOption[]> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("courts")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) {
    console.error("[AdminBookings] Failed to fetch courts:", error.message);
    return [];
  }

  return (data ?? []).map((c) => ({ id: c.id, name: c.name }));
}

// ---------------------------------------------------------------------------
// Admin Bookings Page — Server Component Shell
//
// Fetches initial bookings and court options server-side, then hands off to
// AdminBookingsClient for interactive filtering and row-level actions.
//
// Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
// ---------------------------------------------------------------------------

export default async function AdminBookingsPage() {
  // Auth guard — middleware protects the route, but verify defensively
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/auth/login");
  }

  // Fetch in parallel
  const [bookings, courts] = await Promise.all([
    fetchAllBookings(),
    fetchCourts(),
  ]);

  return (
    <Box component="article" aria-label="Admin bookings management">
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
            Bookings
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: "rgba(255,255,255,0.8)", mt: 0.5 }}
          >
            View, filter, approve, cancel, or reschedule member bookings.
          </Typography>
        </Container>
      </Box>

      {/* ===================================================================
          Content
      =================================================================== */}
      <Box sx={{ py: { xs: 3, md: 4 } }}>
        <Container maxWidth="xl">
          <AdminBookingsClient initialBookings={bookings} courts={courts} />
        </Container>
      </Box>
    </Box>
  );
}
