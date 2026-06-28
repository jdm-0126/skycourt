import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import AddIcon from "@mui/icons-material/Add";
import NextLink from "next/link";

import { createClient } from "@/lib/supabase/server";
import MemberBookingsList, {
  type Booking,
} from "@/components/member/MemberBookingsList";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "My Bookings — Sky Court Pickleball",
  description:
    "View and manage your upcoming and past pickleball court bookings at Sky Court.",
};

// ---------------------------------------------------------------------------
// Member Dashboard Page — Server Component
//
// Fetches the authenticated member's bookings directly from Supabase,
// splits them into upcoming and past, then passes both arrays to the
// MemberBookingsList client component.
//
// The (member) route group is protected by middleware — only
// authenticated members, admins, and super_admins reach this page
// (Requirement 6.1).
//
// Requirements: 8.1, 8.2, 8.3, 8.4
// ---------------------------------------------------------------------------

type BookingRow = {
  id: string;
  court_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: "pending" | "confirmed" | "cancelled" | "rescheduled";
  courts: { name: string } | null;
};

async function fetchMemberBookings(
  userId: string
): Promise<{ upcoming: Booking[]; past: Booking[] }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("bookings")
    .select("id, court_id, booking_date, start_time, end_time, status, courts(name)")
    .eq("member_id", userId)
    .order("booking_date", { ascending: false })
    .order("start_time", { ascending: false });

  if (error) {
    // Non-fatal — render empty lists rather than crashing the page
    console.error("[MemberDashboard] Failed to fetch bookings:", error.message);
    return { upcoming: [], past: [] };
  }

  const bookings = (data ?? []) as BookingRow[];

  // Split using same logic as the GET /api/bookings route handler
  const todayStr = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

  const upcoming: Booking[] = bookings.filter(
    (b) => b.booking_date >= todayStr && b.status !== "cancelled"
  );

  const past: Booking[] = bookings.filter(
    (b) => b.booking_date < todayStr || b.status === "cancelled"
  );

  return { upcoming, past };
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default async function MemberDashboardPage() {
  // -------------------------------------------------------------------------
  // 1. Resolve the authenticated user — middleware already guards the route,
  //    but we still need the user.id to scope the query.
  // -------------------------------------------------------------------------
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    // Should not normally reach here because middleware redirects first,
    // but guard defensively anyway.
    redirect("/auth/login");
  }

  // -------------------------------------------------------------------------
  // 2. Fetch bookings
  // -------------------------------------------------------------------------
  const { upcoming, past } = await fetchMemberBookings(user.id);

  // -------------------------------------------------------------------------
  // 3. Render
  // -------------------------------------------------------------------------
  return (
    <Box component="main">
      {/* ===================================================================
          Page Header
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
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", sm: "row" },
              alignItems: { xs: "flex-start", sm: "center" },
              justifyContent: "space-between",
              gap: 2,
            }}
          >
            <Box>
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
                My Bookings
              </Typography>
              <Typography
                variant="body1"
                sx={{ color: "rgba(255,255,255,0.85)", mt: 1 }}
              >
                Manage your upcoming court reservations and review past sessions.
              </Typography>
            </Box>

            {/* Quick action — Book a Court */}
            <NextLink href="/bookings/new" style={{ textDecoration: "none", alignSelf: "stretch" }}>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                sx={{
                  bgcolor: "rgba(255,255,255,0.15)",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.4)",
                  backdropFilter: "blur(4px)",
                  "&:hover": {
                    bgcolor: "rgba(255,255,255,0.25)",
                  },
                  flexShrink: 0,
                  width: "100%",
                }}
                aria-label="Book a new court"
              >
                Book a Court
              </Button>
            </NextLink>
          </Box>
        </Container>
      </Box>

      {/* ===================================================================
          Bookings Content
      ==================================================================== */}
      <Box
        component="section"
        aria-label="Your bookings"
        sx={{ bgcolor: "background.default", py: { xs: 4, md: 6 } }}
      >
        <Container maxWidth="lg">
          {/* Summary line */}
          <Box sx={{ mb: 3 }}>
            <Typography
              variant="h5"
              component="h2"
              fontWeight={700}
              gutterBottom
            >
              Reservations
            </Typography>
            <Divider />
          </Box>

          {/* Summary stats */}
          <Box
            sx={{
              display: "flex",
              gap: 3,
              mb: 4,
              flexWrap: "wrap",
            }}
            role="status"
            aria-live="polite"
            aria-label="Booking summary"
          >
            <Box
              sx={{
                px: 3,
                py: 2,
                borderRadius: 2,
                bgcolor: "primary.main",
                color: "#fff",
                textAlign: "center",
                minWidth: 120,
              }}
            >
              <Typography variant="h4" component="p" fontWeight={800}>
                {upcoming.length}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                Upcoming
              </Typography>
            </Box>

            <Box
              sx={{
                px: 3,
                py: 2,
                borderRadius: 2,
                bgcolor: "background.paper",
                border: "1px solid",
                borderColor: "divider",
                textAlign: "center",
                minWidth: 120,
              }}
            >
              <Typography
                variant="h4"
                component="p"
                fontWeight={800}
                color="text.secondary"
              >
                {past.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Past
              </Typography>
            </Box>
          </Box>

          {/* Interactive bookings list — Req 8.1, 8.2, 8.3, 8.4 */}
          <MemberBookingsList upcoming={upcoming} past={past} />
        </Container>
      </Box>
    </Box>
  );
}
