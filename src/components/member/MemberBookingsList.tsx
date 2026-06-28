"use client";

/**
 * MemberBookingsList — Client Component
 *
 * Receives upcoming and past booking arrays fetched server-side.
 * Displays two tabs (Upcoming / Past). Each row shows court name,
 * date, time slot, and a status chip. Upcoming bookings (not already
 * cancelled) get a Cancel button that calls DELETE /api/bookings/:id
 * and refreshes the page data via router.refresh().
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */

import React, { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Snackbar from "@mui/material/Snackbar";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import CancelIcon from "@mui/icons-material/Cancel";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import EventBusyIcon from "@mui/icons-material/EventBusy";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import ScheduleIcon from "@mui/icons-material/Schedule";
import SportsIcon from "@mui/icons-material/Sports";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Booking {
  id: string;
  court_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: "pending" | "confirmed" | "cancelled" | "rescheduled";
  courts: { name: string } | null;
}

export interface MemberBookingsListProps {
  upcoming: Booking[];
  past: Booking[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format an ISO date string ("YYYY-MM-DD") to a human-readable date. */
function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-PH", {
    weekday: "short",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Format a time string ("HH:MM:SS" or "HH:MM") to "H:MM AM/PM". */
function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  const minute = String(m).padStart(2, "0");
  return `${hour}:${minute} ${ampm}`;
}

/** Map booking status to a MUI Chip color. */
function statusColor(
  status: Booking["status"]
): "warning" | "success" | "default" | "info" {
  switch (status) {
    case "pending":
      return "warning";
    case "confirmed":
      return "success";
    case "cancelled":
      return "default";
    case "rescheduled":
      return "info";
  }
}

/** Map booking status to a readable label. */
function statusLabel(status: Booking["status"]): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "confirmed":
      return "Confirmed";
    case "cancelled":
      return "Cancelled";
    case "rescheduled":
      return "Rescheduled";
  }
}

/** Map booking status to an icon. */
function StatusIcon({ status }: { status: Booking["status"] }) {
  switch (status) {
    case "pending":
      return <HourglassEmptyIcon fontSize="small" />;
    case "confirmed":
      return <CheckCircleOutlineIcon fontSize="small" />;
    case "cancelled":
      return <EventBusyIcon fontSize="small" />;
    case "rescheduled":
      return <ScheduleIcon fontSize="small" />;
  }
}

// ---------------------------------------------------------------------------
// BookingRow
// ---------------------------------------------------------------------------

interface BookingRowProps {
  booking: Booking;
  /** Whether to show cancel button. True only for upcoming non-cancelled bookings. */
  canCancel: boolean;
  onCancel: (id: string) => Promise<void>;
  cancellingId: string | null;
}

function BookingRow({
  booking,
  canCancel,
  onCancel,
  cancellingId,
}: BookingRowProps) {
  const courtName = booking.courts?.name ?? "Unknown Court";
  const isCancelling = cancellingId === booking.id;

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2, sm: 2.5 },
        border: "1px solid",
        borderColor: booking.status === "cancelled" ? "divider" : "transparent",
        borderRadius: 2,
        bgcolor:
          booking.status === "cancelled"
            ? "action.hover"
            : "background.paper",
        boxShadow: booking.status !== "cancelled"
          ? "0 1px 4px rgba(0,0,0,0.08)"
          : "none",
        transition: "box-shadow 0.2s",
        "&:hover":
          booking.status !== "cancelled"
            ? { boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }
            : {},
      }}
      role="listitem"
      aria-label={`Booking for ${courtName} on ${formatDate(booking.booking_date)}`}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "flex-start", sm: "center" },
          gap: { xs: 1.5, sm: 2 },
        }}
      >
        {/* Court icon */}
        <Box
          sx={{
            display: { xs: "none", sm: "flex" },
            alignItems: "center",
            justifyContent: "center",
            width: 44,
            height: 44,
            borderRadius: "50%",
            bgcolor: "primary.main",
            flexShrink: 0,
          }}
          aria-hidden="true"
        >
          <SportsIcon sx={{ color: "#fff", fontSize: 22 }} />
        </Box>

        {/* Details */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="subtitle1"
            fontWeight={600}
            noWrap
            title={courtName}
          >
            {courtName}
          </Typography>

          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: 1.5,
              mt: 0.5,
            }}
          >
            {/* Date */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <CalendarTodayIcon
                sx={{ fontSize: 14, color: "text.secondary" }}
                aria-hidden="true"
              />
              <Typography variant="body2" color="text.secondary">
                {formatDate(booking.booking_date)}
              </Typography>
            </Box>

            {/* Time slot */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <ScheduleIcon
                sx={{ fontSize: 14, color: "text.secondary" }}
                aria-hidden="true"
              />
              <Typography variant="body2" color="text.secondary">
                {formatTime(booking.start_time)} – {formatTime(booking.end_time)}
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Right side: status chip + cancel button */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            flexShrink: 0,
            width: { xs: "100%", sm: "auto" },
            justifyContent: { xs: "space-between", sm: "flex-end" },
          }}
        >
          {/* Status chip — Req 8.3 */}
          <Chip
            icon={<StatusIcon status={booking.status} />}
            label={statusLabel(booking.status)}
            color={statusColor(booking.status)}
            size="small"
            variant="outlined"
            aria-label={`Status: ${statusLabel(booking.status)}`}
          />

          {/* Cancel button — Req 8.4 */}
          {canCancel && (
            <Button
              variant="outlined"
              color="error"
              size="small"
              startIcon={
                isCancelling ? (
                  <CircularProgress size={14} color="inherit" />
                ) : (
                  <CancelIcon />
                )
              }
              disabled={isCancelling}
              onClick={() => void onCancel(booking.id)}
              aria-label={`Cancel booking for ${courtName} on ${formatDate(booking.booking_date)}`}
              sx={{ whiteSpace: "nowrap" }}
            >
              {isCancelling ? "Cancelling…" : "Cancel"}
            </Button>
          )}
        </Box>
      </Box>
    </Paper>
  );
}

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------

function EmptyState({ message }: { message: string }) {
  return (
    <Box
      sx={{
        textAlign: "center",
        py: 6,
        px: 2,
        color: "text.secondary",
      }}
      role="status"
      aria-live="polite"
    >
      <EventBusyIcon sx={{ fontSize: 48, opacity: 0.3, mb: 1 }} aria-hidden="true" />
      <Typography variant="body1">{message}</Typography>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// MemberBookingsList
// ---------------------------------------------------------------------------

export default function MemberBookingsList({
  upcoming,
  past,
}: MemberBookingsListProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<0 | 1>(0);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });

  const handleTabChange = (_event: React.SyntheticEvent, newValue: 0 | 1) => {
    setActiveTab(newValue);
  };

  const handleCloseSnackbar = () => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  };

  /** Cancel a booking — Req 8.4 */
  const handleCancel = useCallback(
    async (bookingId: string) => {
      const confirmed = window.confirm(
        "Are you sure you want to cancel this booking? This action cannot be undone."
      );
      if (!confirmed) return;

      setCancellingId(bookingId);

      try {
        const res = await fetch(`/api/bookings/${bookingId}`, {
          method: "DELETE",
        });

        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          throw new Error(body.error ?? "Failed to cancel booking");
        }

        // Refresh server data — pulls fresh upcoming/past from the server component
        router.refresh();

        setSnackbar({
          open: true,
          message: "Booking cancelled successfully.",
          severity: "success",
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to cancel booking";
        setSnackbar({ open: true, message, severity: "error" });
      } finally {
        setCancellingId(null);
      }
    },
    [router]
  );

  return (
    <Box>
      {/* Tab bar */}
      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        aria-label="Booking tabs"
        sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}
      >
        <Tab
          label={
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              Upcoming
              {upcoming.length > 0 && (
                <Chip
                  label={upcoming.length}
                  size="small"
                  color="primary"
                  sx={{ height: 20, fontSize: 11, pointerEvents: "none" }}
                  aria-label={`${upcoming.length} upcoming bookings`}
                />
              )}
            </Box>
          }
          id="tab-upcoming"
          aria-controls="tabpanel-upcoming"
        />
        <Tab
          label={
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              Past
              {past.length > 0 && (
                <Chip
                  label={past.length}
                  size="small"
                  color="default"
                  sx={{ height: 20, fontSize: 11, pointerEvents: "none" }}
                  aria-label={`${past.length} past bookings`}
                />
              )}
            </Box>
          }
          id="tab-past"
          aria-controls="tabpanel-past"
        />
      </Tabs>

      {/* Upcoming bookings panel — Req 8.1 */}
      <Box
        role="tabpanel"
        id="tabpanel-upcoming"
        aria-labelledby="tab-upcoming"
        hidden={activeTab !== 0}
      >
        <Collapse in={activeTab === 0} timeout="auto" unmountOnExit>
          {upcoming.length === 0 ? (
            <EmptyState message="You have no upcoming bookings." />
          ) : (
            <Box
              role="list"
              aria-label="Upcoming bookings"
              sx={{ display: "flex", flexDirection: "column", gap: 2 }}
            >
              {upcoming.map((booking, index) => (
                <React.Fragment key={booking.id}>
                  {index > 0 && <Divider sx={{ display: { sm: "none" } }} />}
                  <BookingRow
                    booking={booking}
                    canCancel={booking.status !== "cancelled"}
                    onCancel={handleCancel}
                    cancellingId={cancellingId}
                  />
                </React.Fragment>
              ))}
            </Box>
          )}
        </Collapse>
      </Box>

      {/* Past bookings panel — Req 8.2 */}
      <Box
        role="tabpanel"
        id="tabpanel-past"
        aria-labelledby="tab-past"
        hidden={activeTab !== 1}
      >
        <Collapse in={activeTab === 1} timeout="auto" unmountOnExit>
          {past.length === 0 ? (
            <EmptyState message="You have no past bookings." />
          ) : (
            <Box
              role="list"
              aria-label="Past bookings"
              sx={{ display: "flex", flexDirection: "column", gap: 2 }}
            >
              {past.map((booking) => (
                <BookingRow
                  key={booking.id}
                  booking={booking}
                  canCancel={false}
                  onCancel={handleCancel}
                  cancellingId={cancellingId}
                />
              ))}
            </Box>
          )}
        </Collapse>
      </Box>

      {/* Success / error feedback — Req 8.4 */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
