import type { Metadata } from "next";
import { redirect } from "next/navigation";
import NextLink from "next/link";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import SportsTennisIcon from "@mui/icons-material/SportsTennis";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Booking Details — Sky Court Pickleball",
  description: "View the details of your Sky Court pickleball court booking.",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BookingStatus = "pending" | "confirmed" | "cancelled" | "rescheduled";

interface BookingDetail {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  courts: { name: string } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a "YYYY-MM-DD" string for display. */
function formatDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Format a "HH:MM" 24-hour time to "h:MM AM/PM". */
function formatTime(t: string): string {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Map a booking status to a MUI chip color. */
function statusColor(
  status: BookingStatus
): "default" | "success" | "warning" | "error" | "info" {
  switch (status) {
    case "confirmed":
      return "success";
    case "pending":
      return "warning";
    case "cancelled":
      return "error";
    case "rescheduled":
      return "info";
    default:
      return "default";
  }
}

/** Capitalise the first letter of a status string for display. */
function displayStatus(status: BookingStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// ---------------------------------------------------------------------------
// Booking Detail Page — Server Component
//
// Fetches the booking from the database using the booking ID from the URL
// params, joined with the courts table to display the court name. If the
// booking is not found or does not belong to the authenticated member, the
// user is redirected to the dashboard.
//
// This page also acts as the success landing page after a booking is created
// by the BookingFlow client component (Requirement 7.6).
//
// Requirements: 7.1, 7.6
// ---------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BookingDetailPage({ params }: PageProps) {
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
  // 2. Resolve route params
  // -------------------------------------------------------------------------
  const { id: bookingId } = await params;

  // -------------------------------------------------------------------------
  // 3. Fetch the booking joined with the court name
  // -------------------------------------------------------------------------
  const { data: bookingData, error: bookingError } = await supabase
    .from("bookings")
    .select("id, booking_date, start_time, end_time, status, courts(name)")
    .eq("id", bookingId)
    .eq("member_id", user.id) // Ensure the booking belongs to this member
    .maybeSingle();

  if (bookingError) {
    console.error("[BookingDetailPage] Failed to fetch booking:", bookingError.message);
  }

  // If booking not found or doesn't belong to the member, redirect to dashboard
  if (!bookingData) {
    redirect("/member/dashboard");
  }

  const booking = bookingData as BookingDetail;
  const courtName = booking.courts?.name ?? "Unknown Court";

  // -------------------------------------------------------------------------
  // 4. Determine whether this is a freshly created booking to show the
  //    success banner (status is always "pending" for new bookings)
  // -------------------------------------------------------------------------
  const isNewBooking = booking.status === "pending";

  // -------------------------------------------------------------------------
  // 5. Render
  // -------------------------------------------------------------------------
  return (
    <Box component="main">
      {/* ===================================================================
          Page Header — green gradient consistent with other member pages
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
            Booking Details
          </Typography>
          <Typography
            variant="body1"
            sx={{ color: "rgba(255,255,255,0.85)", mt: 1 }}
          >
            Your court reservation details are shown below.
          </Typography>
        </Container>
      </Box>

      {/* ===================================================================
          Booking Detail Content
      ==================================================================== */}
      <Box
        component="section"
        aria-label="Booking details"
        sx={{ bgcolor: "background.default", py: { xs: 4, md: 6 } }}
      >
        <Container maxWidth="sm">
          {/* ---------------------------------------------------------------
              Success banner — shown for newly created (pending) bookings
              to fulfil the booking success page requirement (Req 7.6)
          --------------------------------------------------------------- */}
          {isNewBooking && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                mb: 4,
                p: 3,
                borderRadius: 2,
                bgcolor: "success.light",
                color: "success.contrastText",
              }}
              role="status"
              aria-live="polite"
            >
              <CheckCircleIcon
                sx={{ color: "success.dark", fontSize: 40 }}
                aria-hidden="true"
              />
              <Box>
                <Typography variant="h6" fontWeight={700} color="success.dark">
                  Booking Confirmed!
                </Typography>
                <Typography variant="body2" color="success.dark">
                  Your booking has been submitted and is pending admin approval.
                </Typography>
              </Box>
            </Box>
          )}

          {/* ---------------------------------------------------------------
              Booking summary card
          --------------------------------------------------------------- */}
          <Paper
            variant="outlined"
            sx={{ borderRadius: 3, overflow: "hidden", mb: 3 }}
          >
            {/* Card header */}
            <Box
              sx={{
                p: 2.5,
                bgcolor: "primary.main",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Typography variant="subtitle1" fontWeight={700}>
                Booking Summary
              </Typography>
              <Chip
                label={displayStatus(booking.status)}
                color={statusColor(booking.status)}
                size="small"
                sx={{ fontWeight: 700 }}
                aria-label={`Booking status: ${displayStatus(booking.status)}`}
              />
            </Box>

            {/* Card body */}
            <Box sx={{ p: 3 }}>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
                {/* Reference ID */}
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Booking Reference
                  </Typography>
                  <Typography
                    variant="body2"
                    fontFamily="monospace"
                    sx={{ wordBreak: "break-all" }}
                  >
                    {booking.id}
                  </Typography>
                </Box>

                <Divider />

                {/* Court */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <SportsTennisIcon
                    color="primary"
                    fontSize="small"
                    aria-hidden="true"
                  />
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Court
                    </Typography>
                    <Typography variant="body1" fontWeight={600}>
                      {courtName}
                    </Typography>
                  </Box>
                </Box>

                <Divider />

                {/* Date */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <CalendarTodayIcon
                    color="primary"
                    fontSize="small"
                    aria-hidden="true"
                  />
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Date
                    </Typography>
                    <Typography variant="body1" fontWeight={600}>
                      {formatDate(booking.booking_date)}
                    </Typography>
                  </Box>
                </Box>

                <Divider />

                {/* Time Slot */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <AccessTimeIcon
                    color="primary"
                    fontSize="small"
                    aria-hidden="true"
                  />
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Time Slot
                    </Typography>
                    <Typography variant="body1" fontWeight={600}>
                      {formatTime(booking.start_time)} –{" "}
                      {formatTime(booking.end_time)}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </Box>
          </Paper>

          {/* ---------------------------------------------------------------
              Navigation actions
          --------------------------------------------------------------- */}
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            <NextLink href="/member/dashboard" style={{ textDecoration: "none" }}>
              <Button
                variant="contained"
                color="primary"
                startIcon={<ArrowBackIcon />}
                aria-label="Back to dashboard"
              >
                Back to Dashboard
              </Button>
            </NextLink>

            <NextLink href="/member/bookings/new" style={{ textDecoration: "none" }}>
              <Button
                variant="outlined"
                color="primary"
                aria-label="Book another court"
              >
                Book Another Court
              </Button>
            </NextLink>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}
