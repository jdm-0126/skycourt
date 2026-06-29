"use client";

/**
 * BookingsCalendar — responsive monthly calendar view for admin bookings.
 *
 * Shows bookings as coloured chips on each day. Tapping a day opens a
 * bottom-sheet drawer listing all bookings for that day with full details
 * and action buttons. Works on mobile and desktop.
 */

import React, { useState, useMemo } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Drawer from "@mui/material/Drawer";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Button from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";
import CircularProgress from "@mui/material/CircularProgress";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloseIcon from "@mui/icons-material/Close";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import EditCalendarIcon from "@mui/icons-material/EditCalendar";

import type { AdminBooking } from "@/app/(admin)/admin/bookings/AdminBookingsClient";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function formatTime(t: string): string { return t.slice(0, 5); }
function formatDateLong(iso: string): string {
  const [y, m, d] = iso.split("-");
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  return dt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function statusColor(status: AdminBooking["status"]): "warning" | "success" | "error" | "default" {
  if (status === "pending")   return "warning";
  if (status === "confirmed") return "success";
  if (status === "cancelled") return "error";
  return "default";
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  bookings: AdminBooking[];
  actionLoading: string | null;
  onApprove: (b: AdminBooking) => void;
  onCancel:  (b: AdminBooking) => void;
  onReschedule: (b: AdminBooking) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BookingsCalendar({ bookings, actionLoading, onApprove, onCancel, onReschedule }: Props) {
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Map "YYYY-MM-DD" → bookings[]
  const byDate = useMemo(() => {
    const map = new Map<string, AdminBooking[]>();
    for (const b of bookings) {
      const key = b.booking_date.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    return map;
  }, [bookings]);

  // Calendar grid
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to full rows
  while (cells.length % 7 !== 0) cells.push(null);

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  function isoForDay(day: number): string {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const selectedBookings = selectedDay ? (byDate.get(selectedDay) ?? []) : [];

  return (
    <Box>
      {/* ── Month navigation ── */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <IconButton onClick={prevMonth} aria-label="Previous month" size="small"><ChevronLeftIcon /></IconButton>
        <Typography variant="h6" fontWeight={700}>
          {MONTH_NAMES[month]} {year}
        </Typography>
        <IconButton onClick={nextMonth} aria-label="Next month" size="small"><ChevronRightIcon /></IconButton>
      </Box>

      {/* ── Day-of-week header ── */}
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", mb: 0.5 }}>
        {DAY_LABELS.map(d => (
          <Typography key={d} variant="caption" align="center" fontWeight={700}
            sx={{ color: "text.secondary", py: 0.5 }}>{d}</Typography>
        ))}
      </Box>

      {/* ── Calendar grid ── */}
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" }}>
        {cells.map((day, idx) => {
          if (!day) return <Box key={idx} sx={{ minHeight: { xs: 48, sm: 72 } }} />;
          const iso = isoForDay(day);
          const dayBookings = byDate.get(iso) ?? [];
          const isToday = iso === today.toISOString().slice(0, 10);
          const isSelected = iso === selectedDay;

          return (
            <Paper
              key={idx}
              onClick={() => setSelectedDay(iso)}
              elevation={0}
              sx={{
                minHeight: { xs: 48, sm: 72 },
                p: { xs: 0.5, sm: 0.75 },
                border: "1px solid",
                borderColor: isSelected ? "primary.main" : isToday ? "primary.light" : "divider",
                bgcolor: isSelected ? "primary.50" : isToday ? "rgba(46,125,50,0.04)" : "#fff",
                cursor: "pointer",
                borderRadius: 1.5,
                transition: "all 0.15s",
                "&:hover": { borderColor: "primary.main", bgcolor: "primary.50" },
                display: "flex",
                flexDirection: "column",
                gap: 0.25,
              }}
              role="button"
              tabIndex={0}
              aria-label={`${formatDateLong(iso)}, ${dayBookings.length} bookings`}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setSelectedDay(iso); }}
            >
              <Typography
                variant="caption"
                fontWeight={isToday ? 800 : 500}
                sx={{ color: isToday ? "primary.main" : "text.primary", lineHeight: 1, mb: 0.25 }}
              >
                {day}
              </Typography>
              {/* Show up to 2 status chips on desktop, just a count badge on mobile */}
              {dayBookings.length > 0 && (
                <>
                  <Box sx={{ display: { xs: "none", sm: "flex" }, flexDirection: "column", gap: 0.25 }}>
                    {dayBookings.slice(0, 2).map((b, bi) => (
                      <Chip
                        key={bi}
                        label={b.courts?.name ?? "Court"}
                        color={statusColor(b.status)}
                        size="small"
                        sx={{ height: 16, fontSize: "0.58rem", "& .MuiChip-label": { px: 0.5 } }}
                      />
                    ))}
                    {dayBookings.length > 2 && (
                      <Typography variant="caption" sx={{ fontSize: "0.6rem", color: "text.secondary", pl: 0.25 }}>
                        +{dayBookings.length - 2} more
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ display: { xs: "flex", sm: "none" }, justifyContent: "center" }}>
                    <Chip
                      label={dayBookings.length}
                      color="primary"
                      size="small"
                      sx={{ height: 16, fontSize: "0.6rem", "& .MuiChip-label": { px: 0.5 } }}
                    />
                  </Box>
                </>
              )}
            </Paper>
          );
        })}
      </Box>

      {/* ── Day detail drawer ── */}
      <Drawer
        anchor="bottom"
        open={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        slotProps={{
          paper: {
            sx: {
              borderRadius: "16px 16px 0 0",
              maxHeight: "75vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            },
          },
        }}
      >
        {/* Drawer header */}
        <Box sx={{ px: 2, pt: 2, pb: 1, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <Box>
            <Typography variant="h6" fontWeight={700}>
              {selectedDay ? formatDateLong(selectedDay) : ""}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {selectedBookings.length} booking{selectedBookings.length !== 1 ? "s" : ""}
            </Typography>
          </Box>
          <IconButton onClick={() => setSelectedDay(null)} aria-label="Close" size="small">
            <CloseIcon />
          </IconButton>
        </Box>
        <Divider />

        {/* Booking list */}
        <Box sx={{ overflowY: "auto", flex: 1, px: 2, py: 1.5 }}>
          {selectedBookings.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 4 }}>
              No bookings on this day.
            </Typography>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {selectedBookings.map(b => {
                const isActioning = actionLoading === b.id;
                return (
                  <Paper key={b.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 1 }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={700} noWrap>
                          {b.users?.full_name ?? "Unknown"}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap display="block">
                          {b.users?.email ?? ""}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {b.courts?.name ?? "—"} · {formatTime(b.start_time)}–{formatTime(b.end_time)}
                        </Typography>
                      </Box>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
                        <Chip label={b.status} color={statusColor(b.status)} size="small" />
                        <Tooltip title="Approve">
                          <span>
                            <IconButton size="small" color="success"
                              disabled={isActioning || b.status !== "pending"}
                              onClick={() => onApprove(b)}
                              aria-label={`Approve booking for ${b.users?.full_name ?? "member"}`}>
                              {isActioning ? <CircularProgress size={14} /> : <CheckCircleOutlineIcon fontSize="small" />}
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Cancel">
                          <span>
                            <IconButton size="small" color="error"
                              disabled={isActioning || b.status === "cancelled"}
                              onClick={() => onCancel(b)}
                              aria-label={`Cancel booking for ${b.users?.full_name ?? "member"}`}>
                              <CancelOutlinedIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Reschedule">
                          <span>
                            <IconButton size="small" color="primary"
                              disabled={isActioning || b.status === "cancelled"}
                              onClick={() => onReschedule(b)}
                              aria-label={`Reschedule booking for ${b.users?.full_name ?? "member"}`}>
                              <EditCalendarIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Box>
                    </Box>
                  </Paper>
                );
              })}
            </Box>
          )}
        </Box>

        <Box sx={{ px: 2, pb: 2, pt: 1, flexShrink: 0 }}>
          <Button fullWidth variant="outlined" onClick={() => setSelectedDay(null)}>Close</Button>
        </Box>
      </Drawer>
    </Box>
  );
}
