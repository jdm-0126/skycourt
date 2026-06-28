"use client";

import React, { useState, useEffect, useCallback } from "react";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import EventIcon from "@mui/icons-material/Event";
import CancelIcon from "@mui/icons-material/Cancel";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import DownloadIcon from "@mui/icons-material/Download";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import TableChartIcon from "@mui/icons-material/TableChart";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import SportsIcon from "@mui/icons-material/Sports";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Range = "daily" | "weekly" | "monthly";

interface BookingPerCourt {
  courtName: string;
  count: number;
}

interface PeakHour {
  hour: number;
  count: number;
}

interface ReportMetrics {
  range: Range;
  totalBookings: number;
  bookingsPerCourt: BookingPerCourt[];
  peakHours: PeakHour[];
  cancelledCount: number;
  newMemberRegistrations: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: "daily", label: "Today" },
  { value: "weekly", label: "Last 7 Days" },
  { value: "monthly", label: "Last 30 Days" },
];

function formatHour(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? "AM" : "PM";
  return `${String(h).padStart(2, "0")}:00 ${ampm}`;
}

// ---------------------------------------------------------------------------
// Metric Card sub-component
// ---------------------------------------------------------------------------

function MetricCard({
  icon,
  label,
  value,
  color,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  loading: boolean;
}) {
  return (
    <Card sx={{ height: "100%", borderTop: "4px solid", borderTopColor: color }}>
      <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, py: 3 }}>
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
          {loading ? (
            <Skeleton variant="text" width={60} height={40} />
          ) : (
            <Typography variant="h4" component="p" fontWeight={800} lineHeight={1}>
              {value}
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            {label}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Admin Reports Page — Client Component
//
// Displays aggregated metrics for a selected time range, with export options.
//
// Requirements: 16.1, 16.2, 16.3, 16.4
// ---------------------------------------------------------------------------

export default function AdminReportsPage() {
  // ---- State ----------------------------------------------------------------
  const [range, setRange] = useState<Range>("weekly");
  const [metrics, setMetrics] = useState<ReportMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // ---- Data fetching --------------------------------------------------------

  const fetchMetrics = useCallback(async (selectedRange: Range) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports?range=${selectedRange}`);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({} as { error?: string }))) as {
          error?: string;
        };
        throw new Error(err.error ?? "Failed to load report data.");
      }
      const data = (await res.json()) as ReportMetrics;
      setMetrics(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMetrics(range);
  }, [range, fetchMetrics]);

  // ---- Export handlers -------------------------------------------------------

  async function handleExport(format: "xlsx" | "pdf") {
    const setExporting = format === "xlsx" ? setExportingXlsx : setExportingPdf;
    setExporting(true);
    try {
      const res = await fetch(
        `/api/reports/export?format=${format}&range=${range}`
      );
      if (!res.ok) {
        throw new Error("Failed to generate export.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-${range}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Non-critical — export failure doesn't break the page
    } finally {
      setExporting(false);
    }
  }

  // ---- Render ---------------------------------------------------------------

  return (
    <Box component="article" aria-label="Admin reports">
      {/* =====================================================================
          Page Header
      ===================================================================== */}
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
            Reports
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: "rgba(255,255,255,0.8)", mt: 0.5 }}
          >
            View booking activity, membership trends, and peak usage data.
          </Typography>
        </Container>
      </Box>

      <Box sx={{ py: { xs: 3, md: 4 } }}>
        <Container maxWidth="xl">

          {/* =================================================================
              Controls bar: Range selector + Export buttons
          ================================================================= */}
          <Box
            component="section"
            aria-label="Report controls"
            sx={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 2,
              mb: 4,
            }}
          >
            {/* Range selector */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Typography variant="subtitle1" fontWeight={600}>
                Time Range:
              </Typography>
              <TextField
                select
                value={range}
                onChange={(e) => setRange(e.target.value as Range)}
                size="small"
                sx={{ minWidth: 160 }}
                inputProps={{ "aria-label": "Select time range" }}
              >
                {RANGE_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </TextField>
            </Box>

            {/* Export buttons */}
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Button
                variant="outlined"
                startIcon={
                  exportingXlsx ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : (
                    <TableChartIcon />
                  )
                }
                onClick={() => void handleExport("xlsx")}
                disabled={exportingXlsx || loading}
                aria-label="Export report to Excel"
              >
                Export to Excel
              </Button>
              <Button
                variant="outlined"
                color="error"
                startIcon={
                  exportingPdf ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : (
                    <PictureAsPdfIcon />
                  )
                }
                onClick={() => void handleExport("pdf")}
                disabled={exportingPdf || loading}
                aria-label="Export report to PDF"
              >
                Export to PDF
              </Button>
            </Stack>
          </Box>

          {/* Error banner */}
          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          {/* =================================================================
              Section 1 — Metrics Cards (Requirements 16.1, 16.2)
          ================================================================= */}
          <Box
            component="section"
            aria-label="Summary metrics"
            sx={{ mb: 5 }}
          >
            <Typography variant="h6" component="h2" fontWeight={700} mb={2}>
              Summary
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6} md={4}>
                <MetricCard
                  icon={<EventIcon />}
                  label="Total Bookings"
                  value={metrics?.totalBookings ?? 0}
                  color="#2e7d32"
                  loading={loading}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <MetricCard
                  icon={<CancelIcon />}
                  label="Cancelled Bookings"
                  value={metrics?.cancelledCount ?? 0}
                  color="#c62828"
                  loading={loading}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <MetricCard
                  icon={<PersonAddIcon />}
                  label="New Members"
                  value={metrics?.newMemberRegistrations ?? 0}
                  color="#1565c0"
                  loading={loading}
                />
              </Grid>
            </Grid>
          </Box>

          {/* =================================================================
              Sections 2 & 3 side by side
          ================================================================= */}
          <Grid container spacing={3} alignItems="flex-start">
            {/* =============================================================
                Section 2 — Bookings per Court (Requirement 16.2)
            ============================================================= */}
            <Grid item xs={12} md={6}>
              <Card
                component="section"
                aria-label="Bookings per court"
                sx={{ height: "100%" }}
              >
                <CardContent sx={{ pb: "16px !important" }}>
                  <Box
                    sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}
                  >
                    <SportsIcon color="action" fontSize="small" />
                    <Typography variant="h6" component="h2" fontWeight={700}>
                      Bookings per Court
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary" mb={2}>
                    Number of bookings by court for the selected period
                  </Typography>
                  <Divider sx={{ mb: 2 }} />

                  {loading ? (
                    <Stack spacing={1}>
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} variant="rectangular" height={36} sx={{ borderRadius: 1 }} />
                      ))}
                    </Stack>
                  ) : !metrics || metrics.bookingsPerCourt.length === 0 ? (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ py: 4, textAlign: "center" }}
                    >
                      No booking data for this period.
                    </Typography>
                  ) : (
                    <TableContainer
                      component={Paper}
                      variant="outlined"
                      sx={{ borderRadius: 2 }}
                    >
                      <Table
                        size="small"
                        aria-label="Bookings per court table"
                      >
                        <TableHead>
                          <TableRow sx={{ bgcolor: "grey.100" }}>
                            <TableCell sx={{ fontWeight: 700 }}>Court</TableCell>
                            <TableCell sx={{ fontWeight: 700 }} align="right">
                              Bookings
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {metrics.bookingsPerCourt.map((row) => (
                            <TableRow
                              key={row.courtName}
                              hover
                              sx={{
                                "&:last-child td, &:last-child th": {
                                  border: 0,
                                },
                              }}
                            >
                              <TableCell>{row.courtName}</TableCell>
                              <TableCell align="right">
                                <Typography
                                  variant="body2"
                                  fontWeight={700}
                                  color="primary"
                                >
                                  {row.count}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* =============================================================
                Section 3 — Peak Booking Hours (Requirement 16.2)
            ============================================================= */}
            <Grid item xs={12} md={6}>
              <Card
                component="section"
                aria-label="Peak booking hours"
                sx={{ height: "100%" }}
              >
                <CardContent sx={{ pb: "16px !important" }}>
                  <Box
                    sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}
                  >
                    <AccessTimeIcon color="action" fontSize="small" />
                    <Typography variant="h6" component="h2" fontWeight={700}>
                      Peak Booking Hours
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary" mb={2}>
                    Distribution of bookings by start hour
                  </Typography>
                  <Divider sx={{ mb: 2 }} />

                  {loading ? (
                    <Stack spacing={1}>
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} variant="rectangular" height={36} sx={{ borderRadius: 1 }} />
                      ))}
                    </Stack>
                  ) : !metrics || metrics.peakHours.length === 0 ? (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ py: 4, textAlign: "center" }}
                    >
                      No booking data for this period.
                    </Typography>
                  ) : (
                    <TableContainer
                      component={Paper}
                      variant="outlined"
                      sx={{ borderRadius: 2 }}
                    >
                      <Table
                        size="small"
                        aria-label="Peak booking hours table"
                      >
                        <TableHead>
                          <TableRow sx={{ bgcolor: "grey.100" }}>
                            <TableCell sx={{ fontWeight: 700 }}>Hour</TableCell>
                            <TableCell sx={{ fontWeight: 700 }} align="right">
                              Bookings
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {metrics.peakHours.map((row) => (
                            <TableRow
                              key={row.hour}
                              hover
                              sx={{
                                "&:last-child td, &:last-child th": {
                                  border: 0,
                                },
                              }}
                            >
                              <TableCell>{formatHour(row.hour)}</TableCell>
                              <TableCell align="right">
                                <Typography
                                  variant="body2"
                                  fontWeight={700}
                                  color="primary"
                                >
                                  {row.count}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>

        </Container>
      </Box>
    </Box>
  );
}
