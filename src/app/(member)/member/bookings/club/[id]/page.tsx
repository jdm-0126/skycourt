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
import GroupsIcon from "@mui/icons-material/Groups";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import SportsTennisIcon from "@mui/icons-material/SportsTennis";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import ClubReservationActions from "@/components/booking/ClubReservationActions";

export const metadata: Metadata = {
  title: "Club Reservation Details — Sky Court Pickleball",
  description: "View and manage your Sky Court club court reservation.",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReservationStatus = "pending" | "confirmed" | "cancelled";

interface CourtRow {
  court_id: string;
  courts: { name: string } | null;
}

interface ClubReservation {
  id: string;
  member_id: string;
  reservation_date: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  num_courts: number;
  total_cost: number;
  status: ReservationStatus;
  created_at: string;
  club_reservation_courts: CourtRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

function formatTime(t: string): string {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

function statusColor(status: ReservationStatus): "default" | "success" | "warning" | "error" {
  switch (status) {
    case "confirmed": return "success";
    case "pending":   return "warning";
    case "cancelled": return "error";
    default:          return "default";
  }
}

function isCancellable(reservationDate: string): boolean {
  const resDate = new Date(`${reservationDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayBefore = new Date(resDate);
  dayBefore.setDate(dayBefore.getDate() - 1);
  return today <= dayBefore;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ClubBookingDetailPage({ params }: PageProps) {
  const { id: reservationId } = await params;

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) redirect("/auth/login");

  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("club_reservations")
    .select("*, club_reservation_courts(court_id, courts(name))")
    .eq("id", reservationId)
    .maybeSingle();

  if (error || !data) redirect("/member/dashboard");

  const reservation = data as unknown as ClubReservation;

  // Only the owner can view (or admins — but this is the member route)
  if (reservation.member_id !== user.id) redirect("/member/dashboard");

  const isNew = reservation.status === "pending";
  const canActNow = isCancellable(reservation.reservation_date) && reservation.status !== "cancelled";

  const courts = reservation.club_reservation_courts ?? [];

  return (
    <Box component="main">
      {/* Header */}
      <Box
        component="section"
        aria-label="Page header"
        sx={{
          background: "linear-gradient(135deg, #1b5e20 0%, #2e7d32 50%, #43a047 100%)",
          color: "#fff",
          py: { xs: 5, md: 7 },
          px: 2,
        }}
      >
        <Container maxWidth="lg">
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5 }}>
            <GroupsIcon sx={{ fontSize: 28, opacity: 0.9 }} aria-hidden="true" />
            <Typography variant="overline" component="p" sx={{ color: "rgba(255,255,255,0.75)", fontWeight: 700, letterSpacing: 2 }}>
              Club Reservation
            </Typography>
          </Box>
          <Typography
            variant="h3"
            component="h1"
            sx={{ fontWeight: 800, fontSize: { xs: "1.8rem", sm: "2.4rem" }, textShadow: "0 2px 8px rgba(0,0,0,0.2)" }}
          >
            Reservation Details
          </Typography>
        </Container>
      </Box>

      {/* Content */}
      <Box sx={{ bgcolor: "background.default", py: { xs: 4, md: 6 } }}>
        <Container maxWidth="sm">
          {/* Success banner */}
          {isNew && (
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 2, mb: 4, p: 3, borderRadius: 2, bgcolor: "success.light" }}
              role="status"
              aria-live="polite"
            >
              <CheckCircleIcon sx={{ color: "success.dark", fontSize: 40 }} aria-hidden="true" />
              <Box>
                <Typography variant="h6" fontWeight={700} color="success.dark">Reservation Submitted!</Typography>
                <Typography variant="body2" color="success.dark">
                  Your club reservation is pending admin approval.
                </Typography>
              </Box>
            </Box>
          )}

          {/* Summary card */}
          <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden", mb: 3 }}>
            <Box sx={{ p: 2.5, bgcolor: "primary.main", color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Typography variant="subtitle1" fontWeight={700}>Reservation Summary</Typography>
              <Chip
                label={reservation.status.charAt(0).toUpperCase() + reservation.status.slice(1)}
                color={statusColor(reservation.status)}
                size="small"
                sx={{ fontWeight: 700 }}
                aria-label={`Status: ${reservation.status}`}
              />
            </Box>
            <Box sx={{ p: 3, display: "flex", flexDirection: "column", gap: 2.5 }}>
              {/* ID */}
              <Box>
                <Typography variant="caption" color="text.secondary">Reservation Reference</Typography>
                <Typography variant="body2" fontFamily="monospace" sx={{ wordBreak: "break-all" }}>
                  {reservation.id}
                </Typography>
              </Box>

              <Divider />

              {/* Date */}
              <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
                <CalendarTodayIcon color="primary" fontSize="small" aria-hidden="true" />
                <Box>
                  <Typography variant="caption" color="text.secondary">Date</Typography>
                  <Typography variant="body1" fontWeight={600}>{formatDate(reservation.reservation_date)}</Typography>
                </Box>
              </Box>

              <Divider />

              {/* Time */}
              <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
                <AccessTimeIcon color="primary" fontSize="small" aria-hidden="true" />
                <Box>
                  <Typography variant="caption" color="text.secondary">Time Block</Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {formatTime(reservation.start_time)} – {formatTime(reservation.end_time)} ({reservation.duration_hours} hours)
                  </Typography>
                </Box>
              </Box>

              <Divider />

              {/* Courts */}
              <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
                <SportsTennisIcon color="primary" fontSize="small" aria-hidden="true" />
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Courts Reserved ({courts.length})
                  </Typography>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
                    {courts.map((row) => (
                      <Chip
                        key={row.court_id}
                        label={row.courts?.name ?? row.court_id}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                    ))}
                  </Box>
                </Box>
              </Box>

              <Divider />

              {/* Cost */}
              <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
                <GroupsIcon color="primary" fontSize="small" aria-hidden="true" />
                <Box>
                  <Typography variant="caption" color="text.secondary">Total Cost</Typography>
                  <Typography variant="h5" fontWeight={800} color="primary.main">
                    ₱{reservation.total_cost.toLocaleString("en-PH")}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {courts.length} court{courts.length !== 1 ? "s" : ""} × {reservation.duration_hours}h × ₱400/court/hr
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Paper>

          {/* Actions (cancel / reduce courts) — client component */}
          {canActNow && (
            <ClubReservationActions
              reservationId={reservation.id}
              reservationDate={reservation.reservation_date}
              courts={courts.map((r) => ({ id: r.court_id, name: r.courts?.name ?? r.court_id }))}
            />
          )}

          {!canActNow && reservation.status !== "cancelled" && (
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: "warning.50", mb: 3 }}>
              <Typography variant="body2" color="warning.dark" fontWeight={500}>
                This reservation can no longer be modified — the deadline to cancel or reduce courts
                has passed.
              </Typography>
            </Paper>
          )}

          {/* Navigation */}
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mt: 2 }}>
            <NextLink href="/member/dashboard" style={{ textDecoration: "none" }}>
              <Button variant="contained" color="primary" startIcon={<ArrowBackIcon />} aria-label="Back to dashboard">
                Back to Dashboard
              </Button>
            </NextLink>
            <NextLink href="/member/bookings/club/new" style={{ textDecoration: "none" }}>
              <Button variant="outlined" color="primary" aria-label="Make another club reservation">
                Reserve Again
              </Button>
            </NextLink>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}
