import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import EventIcon from "@mui/icons-material/Event";
import PeopleIcon from "@mui/icons-material/People";
import SportsIcon from "@mui/icons-material/Sports";

import { createClient } from "@/lib/supabase/server";
import { fetchDashboardStats } from "./stats";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Admin overview: today's bookings, active members, and court availability.",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BookingRow = {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: "pending" | "confirmed" | "cancelled" | "rescheduled";
  created_at: string;
  courts: { name: string } | null;
  users: { full_name: string } | null;
};

type RecentActivity = BookingRow[];

type WeeklyCalendarEntry = {
  date: string; // "YYYY-MM-DD"
  dayLabel: string; // e.g. "Mon 3 Jun"
  bookings: BookingRow[];
};

// ---------------------------------------------------------------------------
// Data fetching helpers
// ---------------------------------------------------------------------------

async function fetchRecentActivity(): Promise<RecentActivity> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, booking_date, start_time, end_time, status, created_at, courts(name), users(full_name)"
    )
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("[AdminDashboard] Failed to fetch recent activity:", error.message);
    return [];
  }

  return (data ?? []) as BookingRow[];
}

async function fetchWeeklyBookings(): Promise<WeeklyCalendarEntry[]> {
  const supabase = await createClient();

  // Build a 7-day window starting today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekDates: Date[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });

  const startDate = weekDates[0].toISOString().slice(0, 10);
  const endDate = weekDates[6].toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, booking_date, start_time, end_time, status, created_at, courts(name), users(full_name)"
    )
    .gte("booking_date", startDate)
    .lte("booking_date", endDate)
    .in("status", ["pending", "confirmed"])
    .order("booking_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    console.error("[AdminDashboard] Failed to fetch weekly bookings:", error.message);
    return weekDates.map((d) => ({
      date: d.toISOString().slice(0, 10),
      dayLabel: formatDayLabel(d),
      bookings: [],
    }));
  }

  const allBookings = (data ?? []) as BookingRow[];

  return weekDates.map((d) => {
    const dateStr = d.toISOString().slice(0, 10);
    return {
      date: dateStr,
      dayLabel: formatDayLabel(d),
      bookings: allBookings.filter((b) => b.booking_date === dateStr),
    };
  });
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatTime(time: string): string {
  // time is "HH:MM:SS" or "HH:MM"
  return time.slice(0, 5);
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  const d = new Date(Number(year), Number(month) - 1, Number(day));
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatRelativeTime(createdAt: string): string {
  const now = Date.now();
  const then = new Date(createdAt).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function getStatusChipProps(
  status: BookingRow["status"]
): { label: string; color: "warning" | "success" | "default" | "error" } {
  switch (status) {
    case "pending":
      return { label: "Pending", color: "warning" };
    case "confirmed":
      return { label: "Confirmed", color: "success" };
    case "cancelled":
      return { label: "Cancelled", color: "error" };
    case "rescheduled":
      return { label: "Rescheduled", color: "default" };
  }
}

// ---------------------------------------------------------------------------
// Summary Card sub-component
// ---------------------------------------------------------------------------

function SummaryCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Card
      sx={{
        height: "100%",
        borderTop: `4px solid`,
        borderTopColor: color,
      }}
    >
      <CardContent
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          py: 3,
        }}
      >
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: 2,
            bgcolor: color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            flexShrink: 0,
          }}
          aria-hidden="true"
        >
          {icon}
        </Box>
        <Box>
          <Typography
            variant="h4"
            component="p"
            fontWeight={800}
            lineHeight={1}
          >
            {value}
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            {label}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Admin Dashboard Page — Server Component
//
// Displays:
//   1. Summary cards: today's bookings, active members, available courts
//   2. Recent activity feed: latest booking actions (last 10)
//   3. Calendar view: bookings for the current 7-day window
//
// Requirements: 10.1, 10.2, 10.3
// ---------------------------------------------------------------------------

export default async function AdminDashboardPage() {
  // -------------------------------------------------------------------------
  // Auth guard — middleware protects the route, but verify defensively
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
  // Fetch all dashboard data in parallel
  // -------------------------------------------------------------------------
  const [stats, recentActivity, weeklyCalendar] = await Promise.all([
    fetchDashboardStats(),
    fetchRecentActivity(),
    fetchWeeklyBookings(),
  ]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <Box component="article" aria-label="Admin dashboard">
      {/* ===================================================================
          Page Header
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
            Dashboard
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: "rgba(255,255,255,0.8)", mt: 0.5 }}
          >
            {new Date().toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </Typography>
        </Container>
      </Box>

      <Box sx={{ py: { xs: 3, md: 4 } }}>
        <Container maxWidth="xl">
          {/* =================================================================
              Section 1 — Summary Cards (Requirement 10.1)
          ================================================================= */}
          <Box component="section" aria-label="Summary statistics" sx={{ mb: 5 }}>
            <Typography variant="h6" component="h2" fontWeight={700} mb={2}>
              Overview
            </Typography>
            <Grid container spacing={3}>
              {/* Today's Bookings */}
              <Grid item xs={12} sm={6} md={4}>
                <SummaryCard
                  icon={<EventIcon />}
                  label="Today's Bookings"
                  value={stats.todayBookingsCount}
                  color="#2e7d32"
                />
              </Grid>

              {/* Active Members */}
              <Grid item xs={12} sm={6} md={4}>
                <SummaryCard
                  icon={<PeopleIcon />}
                  label="Active Members"
                  value={stats.activeMembersCount}
                  color="#1565c0"
                />
              </Grid>

              {/* Available Courts */}
              <Grid item xs={12} sm={6} md={4}>
                <SummaryCard
                  icon={<SportsIcon />}
                  label="Available Courts"
                  value={stats.availableCourtsCount}
                  color="#e65100"
                />
              </Grid>
            </Grid>
          </Box>

          {/* =================================================================
              Sections 2 & 3 side-by-side on wider screens
          ================================================================= */}
          <Grid container spacing={3} alignItems="flex-start">
            {/* =============================================================
                Section 2 — Recent Activity Feed (Requirement 10.2)
            ============================================================= */}
            <Grid item xs={12} lg={4}>
              <Card component="section" aria-label="Recent activity feed">
                <CardContent sx={{ pb: "16px !important" }}>
                  <Typography variant="h6" component="h2" fontWeight={700} mb={1}>
                    Recent Activity
                  </Typography>
                  <Typography variant="body2" color="text.secondary" mb={2}>
                    Latest booking actions
                  </Typography>
                  <Divider sx={{ mb: 2 }} />

                  {recentActivity.length === 0 ? (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ py: 2, textAlign: "center" }}
                    >
                      No recent activity to display.
                    </Typography>
                  ) : (
                    <Box
                      component="ol"
                      aria-label="Recent booking events"
                      sx={{ listStyle: "none", p: 0, m: 0 }}
                    >
                      {recentActivity.map((booking) => {
                        const chipProps = getStatusChipProps(booking.status);
                        return (
                          <Box
                            key={booking.id}
                            component="li"
                            sx={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 0.5,
                              py: 1.5,
                              borderBottom: "1px solid",
                              borderColor: "divider",
                              "&:last-child": { borderBottom: "none" },
                            }}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                                gap: 1,
                              }}
                            >
                              <Typography
                                variant="body2"
                                fontWeight={600}
                                sx={{
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  flex: 1,
                                }}
                              >
                                {booking.users?.full_name ?? "Unknown member"}
                              </Typography>
                              <Chip
                                label={chipProps.label}
                                color={chipProps.color}
                                size="small"
                                sx={{ flexShrink: 0, height: 20, fontSize: "0.7rem" }}
                              />
                            </Box>
                            <Typography variant="caption" color="text.secondary">
                              {booking.courts?.name ?? "Unknown court"} ·{" "}
                              {formatDate(booking.booking_date)},{" "}
                              {formatTime(booking.start_time)}–
                              {formatTime(booking.end_time)}
                            </Typography>
                            <Typography variant="caption" color="text.disabled">
                              {formatRelativeTime(booking.created_at)}
                            </Typography>
                          </Box>
                        );
                      })}
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* =============================================================
                Section 3 — Weekly Calendar View (Requirement 10.3)
            ============================================================= */}
            <Grid item xs={12} lg={8}>
              <Card component="section" aria-label="Weekly bookings calendar">
                <CardContent sx={{ pb: "16px !important" }}>
                  <Typography variant="h6" component="h2" fontWeight={700} mb={1}>
                    This Week's Bookings
                  </Typography>
                  <Typography variant="body2" color="text.secondary" mb={2}>
                    Active bookings for the next 7 days
                  </Typography>
                  <Divider sx={{ mb: 2 }} />

                  <TableContainer
                    component={Paper}
                    variant="outlined"
                    sx={{ borderRadius: 2 }}
                  >
                    <Table
                      size="small"
                      aria-label="Weekly booking calendar"
                      sx={{ tableLayout: "fixed" }}
                    >
                      <TableHead>
                        <TableRow sx={{ bgcolor: "primary.main" }}>
                          {weeklyCalendar.map((entry) => {
                            const isToday =
                              entry.date ===
                              new Date().toISOString().slice(0, 10);
                            return (
                              <TableCell
                                key={entry.date}
                                align="center"
                                sx={{
                                  color: "#fff",
                                  fontWeight: isToday ? 800 : 600,
                                  fontSize: "0.75rem",
                                  py: 1.5,
                                  width: `${100 / 7}%`,
                                  bgcolor: isToday
                                    ? "primary.dark"
                                    : "primary.main",
                                  borderBottom: isToday
                                    ? "3px solid #fff"
                                    : "none",
                                }}
                              >
                                {entry.dayLabel}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        <TableRow
                          sx={{
                            verticalAlign: "top",
                            "& td": { borderRight: "1px solid", borderColor: "divider" },
                            "& td:last-child": { borderRight: "none" },
                          }}
                        >
                          {weeklyCalendar.map((entry) => {
                            const isToday =
                              entry.date ===
                              new Date().toISOString().slice(0, 10);
                            return (
                              <TableCell
                                key={entry.date}
                                align="center"
                                sx={{
                                  p: 1,
                                  bgcolor: isToday
                                    ? "rgba(111,207,151,0.08)"
                                    : "transparent",
                                  minHeight: 120,
                                }}
                              >
                                {entry.bookings.length === 0 ? (
                                  <Typography
                                    variant="caption"
                                    color="text.disabled"
                                    sx={{ display: "block", py: 2 }}
                                  >
                                    —
                                  </Typography>
                                ) : (
                                  <Box
                                    sx={{
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: 0.5,
                                    }}
                                  >
                                    {entry.bookings.map((b) => {
                                      const chipProps = getStatusChipProps(b.status);
                                      return (
                                        <Box
                                          key={b.id}
                                          sx={{
                                            bgcolor:
                                              b.status === "confirmed"
                                                ? "rgba(46,125,50,0.12)"
                                                : "rgba(237,108,2,0.1)",
                                            border: "1px solid",
                                            borderColor:
                                              b.status === "confirmed"
                                                ? "success.light"
                                                : "warning.light",
                                            borderRadius: 1,
                                            p: 0.5,
                                            textAlign: "left",
                                          }}
                                          aria-label={`${b.users?.full_name ?? "Member"}, ${b.courts?.name ?? "Court"}, ${formatTime(b.start_time)}–${formatTime(b.end_time)}, ${chipProps.label}`}
                                        >
                                          <Typography
                                            variant="caption"
                                            sx={{
                                              display: "block",
                                              fontWeight: 600,
                                              fontSize: "0.65rem",
                                              lineHeight: 1.3,
                                              overflow: "hidden",
                                              textOverflow: "ellipsis",
                                              whiteSpace: "nowrap",
                                            }}
                                          >
                                            {formatTime(b.start_time)}–
                                            {formatTime(b.end_time)}
                                          </Typography>
                                          <Typography
                                            variant="caption"
                                            sx={{
                                              display: "block",
                                              fontSize: "0.65rem",
                                              lineHeight: 1.3,
                                              color: "text.secondary",
                                              overflow: "hidden",
                                              textOverflow: "ellipsis",
                                              whiteSpace: "nowrap",
                                            }}
                                          >
                                            {b.courts?.name ?? "—"}
                                          </Typography>
                                        </Box>
                                      );
                                    })}
                                  </Box>
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>

                  {/* Legend */}
                  <Box
                    sx={{
                      display: "flex",
                      gap: 2,
                      mt: 1.5,
                      flexWrap: "wrap",
                    }}
                    aria-label="Calendar legend"
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: 0.5,
                          bgcolor: "rgba(46,125,50,0.18)",
                          border: "1px solid",
                          borderColor: "success.light",
                        }}
                        aria-hidden="true"
                      />
                      <Typography variant="caption" color="text.secondary">
                        Confirmed
                      </Typography>
                    </Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: 0.5,
                          bgcolor: "rgba(237,108,2,0.12)",
                          border: "1px solid",
                          borderColor: "warning.light",
                        }}
                        aria-hidden="true"
                      />
                      <Typography variant="caption" color="text.secondary">
                        Pending
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Container>
      </Box>
    </Box>
  );
}
