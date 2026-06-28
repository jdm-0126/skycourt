"use client";

import React, { useState, useCallback, useTransition } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import EditCalendarIcon from "@mui/icons-material/EditCalendar";
import FilterListIcon from "@mui/icons-material/FilterList";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BookingStatus = "pending" | "confirmed" | "cancelled" | "rescheduled";

export interface AdminBooking {
  id: string;
  member_id: string;
  court_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  created_at: string;
  updated_at: string;
  courts: { name: string } | null;
  users: { full_name: string; email: string } | null;
}

export interface CourtOption {
  id: string;
  name: string;
}

interface Props {
  initialBookings: AdminBooking[];
  courts: CourtOption[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  const d = new Date(Number(year), Number(month) - 1, Number(day));
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatTime(time: string): string {
  return time.slice(0, 5);
}

function statusChipProps(
  status: BookingStatus
): { label: string; color: "warning" | "success" | "error" | "default" } {
  switch (status) {
    case "pending":     return { label: "Pending",     color: "warning" };
    case "confirmed":   return { label: "Confirmed",   color: "success" };
    case "cancelled":   return { label: "Cancelled",   color: "error"   };
    case "rescheduled": return { label: "Rescheduled", color: "default" };
  }
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "",            label: "All statuses"  },
  { value: "pending",     label: "Pending"       },
  { value: "confirmed",   label: "Confirmed"     },
  { value: "cancelled",   label: "Cancelled"     },
  { value: "rescheduled", label: "Rescheduled"   },
];

// ---------------------------------------------------------------------------
// Reschedule Dialog
// ---------------------------------------------------------------------------

interface RescheduleDialogProps {
  open: boolean;
  booking: AdminBooking | null;
  onClose: () => void;
  onConfirm: (id: string, bookingDate: string, startTime: string, endTime: string) => void;
  loading: boolean;
}

function RescheduleDialog({ open, booking, onClose, onConfirm, loading }: RescheduleDialogProps) {
  const [bookingDate, setBookingDate] = useState(booking?.booking_date ?? "");
  const [startTime,   setStartTime]   = useState(booking?.start_time?.slice(0, 5) ?? "");
  const [endTime,     setEndTime]     = useState(booking?.end_time?.slice(0, 5)   ?? "");
  const [error,       setError]       = useState("");

  // Sync initial values when booking changes
  React.useEffect(() => {
    if (booking) {
      setBookingDate(booking.booking_date);
      setStartTime(booking.start_time.slice(0, 5));
      setEndTime(booking.end_time.slice(0, 5));
      setError("");
    }
  }, [booking]);

  function handleSubmit() {
    if (!bookingDate || !startTime || !endTime) {
      setError("All fields are required.");
      return;
    }
    if (endTime <= startTime) {
      setError("End time must be after start time.");
      return;
    }
    setError("");
    onConfirm(booking!.id, bookingDate, startTime, endTime);
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Reschedule Booking</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Update the date and time for{" "}
          <strong>{booking?.users?.full_name ?? "this member"}</strong> on{" "}
          <strong>{booking?.courts?.name ?? "court"}</strong>.
        </DialogContentText>
        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
        <Stack spacing={2}>
          <TextField
            label="New Date"
            type="date"
            value={bookingDate}
            onChange={(e) => setBookingDate(e.target.value)}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Start Time"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="End Time"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          Reschedule
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Client Component
// ---------------------------------------------------------------------------

/**
 * Admin Bookings client component.
 *
 * Renders a filterable table of all bookings with per-row actions:
 *   - Approve   (PATCH /api/bookings/:id  { action: "approve" })
 *   - Cancel    (DELETE /api/bookings/:id)
 *   - Reschedule (PATCH /api/bookings/:id { action: "reschedule", ... })
 *
 * Idempotency guard: if any action returns 409, we re-fetch that booking
 * from the list endpoint and silently display its current state.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
 */
export default function AdminBookingsClient({ initialBookings, courts }: Props) {
  // ---- State ----------------------------------------------------------------
  const [bookings, setBookings] = useState<AdminBooking[]>(initialBookings);
  const [dateFrom,    setDateFrom]    = useState("");
  const [dateTo,      setDateTo]      = useState("");
  const [courtFilter, setCourtFilter] = useState("");
  const [memberName,  setMemberName]  = useState("");
  const [statusFilter,setStatusFilter]= useState("");
  const [filterOpen,  setFilterOpen]  = useState(false);

  const [actionLoading, setActionLoading] = useState<string | null>(null); // booking id being actioned
  const [rescheduleTarget, setRescheduleTarget] = useState<AdminBooking | null>(null);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);

  const [snack, setSnack] = useState<{ message: string; severity: "success" | "error" | "info" } | null>(null);
  const [, startTransition] = useTransition();

  // ---- Re-fetch helper (used for 409 idempotency guard) --------------------
  const refetchBooking = useCallback(async (id: string): Promise<AdminBooking | null> => {
    try {
      const res = await fetch("/api/bookings/all");
      if (!res.ok) return null;
      const json = (await res.json()) as { data: AdminBooking[] };
      return json.data.find((b) => b.id === id) ?? null;
    } catch {
      return null;
    }
  }, []);

  // ---- Patch booking in local state ----------------------------------------
  const updateLocalBooking = useCallback((updated: AdminBooking) => {
    setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
  }, []);

  // ---- Filter/search -------------------------------------------------------
  async function handleSearch() {
    const params = new URLSearchParams();
    if (dateFrom)     params.set("dateFrom",   dateFrom);
    if (dateTo)       params.set("dateTo",     dateTo);
    if (courtFilter)  params.set("courtId",    courtFilter);
    if (memberName)   params.set("memberName", memberName);
    if (statusFilter) params.set("status",     statusFilter);

    try {
      const res = await fetch(`/api/bookings/all?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = (await res.json()) as { data: AdminBooking[] };
      startTransition(() => setBookings(json.data ?? []));
    } catch {
      setSnack({ message: "Failed to load bookings. Please try again.", severity: "error" });
    }
  }

  function handleClearFilters() {
    setDateFrom("");
    setDateTo("");
    setCourtFilter("");
    setMemberName("");
    setStatusFilter("");
    setBookings(initialBookings);
  }

  // ---- Actions -------------------------------------------------------------

  async function handleApprove(booking: AdminBooking) {
    if (actionLoading) return; // prevent concurrent actions
    setActionLoading(booking.id);
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });

      if (res.status === 409) {
        // Idempotency guard: booking was already actioned — re-fetch and show current state
        const fresh = await refetchBooking(booking.id);
        if (fresh) updateLocalBooking(fresh);
        setSnack({ message: "Booking state has already changed — showing current status.", severity: "info" });
        return;
      }

      if (!res.ok) {
        const err = (await res.json().catch(() => ({} as { error?: string }))) as { error?: string };
        setSnack({ message: err.error ?? "Failed to approve booking.", severity: "error" });
        return;
      }

      const json = (await res.json()) as { booking: AdminBooking };
      // Preserve joined data that PATCH response won't include
      updateLocalBooking({ ...json.booking, courts: booking.courts, users: booking.users });
      setSnack({ message: "Booking approved successfully.", severity: "success" });
    } catch {
      setSnack({ message: "An unexpected error occurred.", severity: "error" });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCancel(booking: AdminBooking) {
    if (actionLoading) return;
    setActionLoading(booking.id);
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, { method: "DELETE" });

      if (res.status === 409) {
        const fresh = await refetchBooking(booking.id);
        if (fresh) updateLocalBooking(fresh);
        setSnack({ message: "Booking state has already changed — showing current status.", severity: "info" });
        return;
      }

      if (!res.ok) {
        const err = (await res.json().catch(() => ({} as { error?: string }))) as { error?: string };
        setSnack({ message: err.error ?? "Failed to cancel booking.", severity: "error" });
        return;
      }

      // Mark as cancelled locally
      updateLocalBooking({ ...booking, status: "cancelled" });
      setSnack({ message: "Booking cancelled successfully.", severity: "success" });
    } catch {
      setSnack({ message: "An unexpected error occurred.", severity: "error" });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRescheduleConfirm(
    id: string,
    bookingDate: string,
    startTime: string,
    endTime: string
  ) {
    const booking = bookings.find((b) => b.id === id);
    if (!booking) return;
    setRescheduleLoading(true);
    try {
      const res = await fetch(`/api/bookings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reschedule", bookingDate, startTime, endTime }),
      });

      if (res.status === 409) {
        const fresh = await refetchBooking(id);
        if (fresh) updateLocalBooking(fresh);
        setSnack({ message: "Booking state has already changed — showing current status.", severity: "info" });
        setRescheduleTarget(null);
        return;
      }

      if (!res.ok) {
        const err = (await res.json().catch(() => ({} as { error?: string }))) as { error?: string };
        setSnack({ message: err.error ?? "Failed to reschedule booking.", severity: "error" });
        return;
      }

      const json = (await res.json()) as { booking: AdminBooking };
      updateLocalBooking({ ...json.booking, courts: booking.courts, users: booking.users });
      setSnack({ message: "Booking rescheduled successfully.", severity: "success" });
      setRescheduleTarget(null);
    } catch {
      setSnack({ message: "An unexpected error occurred.", severity: "error" });
    } finally {
      setRescheduleLoading(false);
    }
  }

  // ---- Render ---------------------------------------------------------------

  return (
    <Box>
      {/* ===================================================================
          Filter Panel
      =================================================================== */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ pb: "16px !important" }}>
          <Box
            sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: filterOpen ? 2 : 0 }}
          >
            <Typography variant="h6" component="h2" fontWeight={700}>
              Filters
            </Typography>
            <Button
              startIcon={<FilterListIcon />}
              size="small"
              onClick={() => setFilterOpen((o) => !o)}
              aria-expanded={filterOpen}
              aria-controls="bookings-filter-panel"
            >
              {filterOpen ? "Hide Filters" : "Show Filters"}
            </Button>
          </Box>

          {filterOpen && (
            <Box
              id="bookings-filter-panel"
              role="search"
              aria-label="Booking filters"
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr 1fr" },
                gap: 2,
              }}
            >
              <TextField
                label="Date From"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                size="small"
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label="Date To"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                size="small"
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label="Court"
                select
                value={courtFilter}
                onChange={(e) => setCourtFilter(e.target.value)}
                size="small"
                fullWidth
              >
                <MenuItem value="">All courts</MenuItem>
                {courts.map((c) => (
                  <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                ))}
              </TextField>
              <TextField
                label="Member Name"
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                size="small"
                fullWidth
                placeholder="Search by name…"
                onKeyDown={(e) => { if (e.key === "Enter") void handleSearch(); }}
              />
              <TextField
                label="Status"
                select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                size="small"
                fullWidth
              >
                {STATUS_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                ))}
              </TextField>
              <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1 }}>
                <Button variant="contained" size="small" onClick={() => void handleSearch()}>
                  Search
                </Button>
                <Button variant="outlined" size="small" onClick={handleClearFilters}>
                  Clear
                </Button>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* ===================================================================
          Bookings Table
      =================================================================== */}
      <Card>
        <CardContent sx={{ pb: "16px !important" }}>
          <Typography variant="h6" component="h2" fontWeight={700} mb={2}>
            All Bookings{" "}
            <Typography component="span" variant="body2" color="text.secondary" fontWeight={400}>
              ({bookings.length})
            </Typography>
          </Typography>

          {bookings.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
              No bookings found for the selected filters.
            </Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
              <Table aria-label="Bookings table" size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: "grey.100" }}>
                    <TableCell sx={{ fontWeight: 700 }}>Member</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Court</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Time Slot</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: "center" }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {bookings.map((booking) => {
                    const chip = statusChipProps(booking.status);
                    const isActioning = actionLoading === booking.id;
                    return (
                      <TableRow
                        key={booking.id}
                        hover
                        sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
                      >
                        <TableCell>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {booking.users?.full_name ?? "—"}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {booking.users?.email ?? ""}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" noWrap>
                            {booking.courts?.name ?? "—"}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" noWrap>
                            {formatDate(booking.booking_date)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" noWrap>
                            {formatTime(booking.start_time)}–{formatTime(booking.end_time)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip label={chip.label} color={chip.color} size="small" />
                        </TableCell>
                        <TableCell align="center">
                          <Box sx={{ display: "flex", justifyContent: "center", gap: 0.5 }}>
                            {/* Approve */}
                            <Tooltip title="Approve booking">
                              <span>
                                <IconButton
                                  size="small"
                                  color="success"
                                  aria-label={`Approve booking for ${booking.users?.full_name ?? "member"}`}
                                  disabled={isActioning || booking.status !== "pending"}
                                  onClick={() => void handleApprove(booking)}
                                >
                                  {isActioning ? (
                                    <CircularProgress size={16} color="inherit" />
                                  ) : (
                                    <CheckCircleOutlineIcon fontSize="small" />
                                  )}
                                </IconButton>
                              </span>
                            </Tooltip>
                            {/* Cancel */}
                            <Tooltip title="Cancel booking">
                              <span>
                                <IconButton
                                  size="small"
                                  color="error"
                                  aria-label={`Cancel booking for ${booking.users?.full_name ?? "member"}`}
                                  disabled={isActioning || booking.status === "cancelled"}
                                  onClick={() => void handleCancel(booking)}
                                >
                                  <CancelOutlinedIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            {/* Reschedule */}
                            <Tooltip title="Reschedule booking">
                              <span>
                                <IconButton
                                  size="small"
                                  color="primary"
                                  aria-label={`Reschedule booking for ${booking.users?.full_name ?? "member"}`}
                                  disabled={isActioning || booking.status === "cancelled"}
                                  onClick={() => setRescheduleTarget(booking)}
                                >
                                  <EditCalendarIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* ===================================================================
          Reschedule Dialog
      =================================================================== */}
      <RescheduleDialog
        open={rescheduleTarget !== null}
        booking={rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        onConfirm={(id, date, start, end) => void handleRescheduleConfirm(id, date, start, end)}
        loading={rescheduleLoading}
      />

      {/* ===================================================================
          Feedback Snackbar
      =================================================================== */}
      <Snackbar
        open={snack !== null}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnack(null)}
          severity={snack?.severity ?? "info"}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {snack?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
