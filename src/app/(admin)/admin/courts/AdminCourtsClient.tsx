"use client";

import React, { useState, useCallback } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";

import { courtSchema, type CourtInput } from "@/lib/validation/court";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UnavailableDate {
  id: string;
  court_id: string;
  unavailable_date: string;
  reason: string | null;
}

export interface AdminCourt {
  id: string;
  name: string;
  operating_hours: Record<string, { open: string; close: string }>;
  status: "available" | "unavailable";
  created_at: string;
  updated_at: string;
  court_unavailable_dates: UnavailableDate[];
}

interface Props {
  initialCourts: AdminCourt[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

type Day = (typeof DAYS)[number];

const DEFAULT_HOURS: Record<Day, { open: string; close: string }> = {
  monday:    { open: "08:00", close: "22:00" },
  tuesday:   { open: "08:00", close: "22:00" },
  wednesday: { open: "08:00", close: "22:00" },
  thursday:  { open: "08:00", close: "22:00" },
  friday:    { open: "08:00", close: "22:00" },
  saturday:  { open: "08:00", close: "22:00" },
  sunday:    { open: "08:00", close: "22:00" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Summarise operating hours as "Mon–Fri 08:00–22:00, Sat–Sun 08:00–20:00" etc. */
function summariseHours(hours: Record<string, { open: string; close: string }>): string {
  const entries = DAYS.map((d) => {
    const h = hours[d];
    return h ? `${h.open}–${h.close}` : "Closed";
  });
  // Show first/last for brevity
  const unique = [...new Set(entries)];
  if (unique.length === 1) return `All days: ${unique[0]}`;
  return `Mon ${entries[0]} … Sun ${entries[6]}`;
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  const d = new Date(Number(year), Number(month) - 1, Number(day));
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Court Form Dialog (Add / Edit)
// ---------------------------------------------------------------------------

interface CourtFormDialogProps {
  open: boolean;
  mode: "add" | "edit";
  court: AdminCourt | null;
  onClose: () => void;
  onSaved: (court: AdminCourt) => void;
}

function CourtFormDialog({ open, mode, court, onClose, onSaved }: CourtFormDialogProps) {
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CourtInput>({
    resolver: zodResolver(courtSchema),
    defaultValues: {
      name: "",
      operatingHours: DEFAULT_HOURS,
      status: "available",
    },
  });

  // Populate form when dialog opens
  React.useEffect(() => {
    if (open) {
      setServerError("");
      if (mode === "edit" && court) {
        reset({
          name: court.name,
          operatingHours: court.operating_hours as CourtInput["operatingHours"],
          status: court.status,
        });
      } else {
        reset({
          name: "",
          operatingHours: DEFAULT_HOURS,
          status: "available",
        });
      }
    }
  }, [open, mode, court, reset]);

  const onSubmit = async (data: CourtInput) => {
    setSaving(true);
    setServerError("");
    try {
      let res: Response;
      if (mode === "add") {
        res = await fetch("/api/courts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      } else {
        res = await fetch(`/api/courts/${court!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      }

      if (!res.ok) {
        const err = (await res.json().catch(() => ({} as { error?: string }))) as { error?: string };
        setServerError(err.error ?? "Failed to save court.");
        return;
      }

      const json = (await res.json()) as { court: AdminCourt };
      onSaved({ ...json.court, court_unavailable_dates: court?.court_unavailable_dates ?? [] });
      onClose();
    } catch {
      setServerError("An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{mode === "add" ? "Add Court" : "Edit Court"}</DialogTitle>
      {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogContent dividers>
          {serverError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {serverError}
            </Alert>
          )}

          {/* Court Name */}
          <Controller
            name="name"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Court Name"
                fullWidth
                required
                error={!!errors.name}
                helperText={errors.name?.message}
                sx={{ mb: 3 }}
              />
            )}
          />

          {/* Status */}
          <Controller
            name="status"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Status"
                select
                fullWidth
                required
                error={!!errors.status}
                helperText={errors.status?.message}
                sx={{ mb: 3 }}
              >
                <MenuItem value="available">Available</MenuItem>
                <MenuItem value="unavailable">Unavailable</MenuItem>
              </TextField>
            )}
          />

          {/* Operating Hours */}
          <Typography variant="subtitle2" fontWeight={700} gutterBottom>
            Operating Hours
          </Typography>
          <Grid container spacing={2}>
            {DAYS.map((day) => (
              <Grid item xs={12} sm={6} md={4} key={day}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 0.5, display: "block" }}>
                  {capitalize(day)}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Controller
                    name={`operatingHours.${day}.open`}
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="Open"
                        type="time"
                        size="small"
                        error={!!errors.operatingHours?.[day]?.open}
                        helperText={errors.operatingHours?.[day]?.open?.message}
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                    )}
                  />
                  <Typography variant="body2" color="text.secondary">–</Typography>
                  <Controller
                    name={`operatingHours.${day}.close`}
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="Close"
                        type="time"
                        size="small"
                        error={!!errors.operatingHours?.[day]?.close}
                        helperText={errors.operatingHours?.[day]?.close?.message}
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                    )}
                  />
                </Stack>
              </Grid>
            ))}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {mode === "add" ? "Add Court" : "Save Changes"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Unavailable Dates Panel
// ---------------------------------------------------------------------------

interface UnavailableDatesPanelProps {
  court: AdminCourt;
  onDatesChanged: (courtId: string, dates: UnavailableDate[]) => void;
  onSnack: (message: string, severity: "success" | "error") => void;
}

function UnavailableDatesPanel({ court, onDatesChanged, onSnack }: UnavailableDatesPanelProps) {
  const [newDate, setNewDate] = useState("");
  const [newReason, setNewReason] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleAddDate() {
    if (!newDate) {
      setAddError("Please select a date.");
      return;
    }
    setAddError("");
    setAdding(true);
    try {
      const res = await fetch(`/api/courts/${court.id}/unavailable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unavailableDate: newDate, reason: newReason || undefined }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({} as { error?: string }))) as { error?: string };
        setAddError(err.error ?? "Failed to add unavailable date.");
        return;
      }

      const json = (await res.json()) as { unavailableDate: UnavailableDate };
      onDatesChanged(court.id, [...court.court_unavailable_dates, json.unavailableDate]);
      setNewDate("");
      setNewReason("");
      onSnack("Unavailable date added.", "success");
    } catch {
      setAddError("An unexpected error occurred.");
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteDate(dateId: string) {
    setDeletingId(dateId);
    try {
      const res = await fetch(`/api/courts/${court.id}/unavailable/${dateId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({} as { error?: string }))) as { error?: string };
        onSnack(err.error ?? "Failed to remove unavailable date.", "error");
        return;
      }

      onDatesChanged(
        court.id,
        court.court_unavailable_dates.filter((d) => d.id !== dateId)
      );
      onSnack("Unavailable date removed.", "success");
    } catch {
      onSnack("An unexpected error occurred.", "error");
    } finally {
      setDeletingId(null);
    }
  }

  const sorted = [...court.court_unavailable_dates].sort((a, b) =>
    a.unavailable_date.localeCompare(b.unavailable_date)
  );

  return (
    <Box sx={{ px: 2, pb: 2, bgcolor: "grey.50", borderTop: "1px solid", borderColor: "divider" }}>
      <Typography variant="subtitle2" fontWeight={700} sx={{ pt: 2, pb: 1 }}>
        Unavailable Dates
      </Typography>

      {/* Existing dates list */}
      {sorted.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          No unavailable dates set.
        </Typography>
      ) : (
        <Stack spacing={0.5} sx={{ mb: 2 }}>
          {sorted.map((d) => (
            <Box
              key={d.id}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                p: 0.75,
                bgcolor: "background.paper",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
              }}
            >
              <Typography variant="body2" sx={{ flex: 1 }}>
                <strong>{formatDate(d.unavailable_date)}</strong>
                {d.reason && (
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    — {d.reason}
                  </Typography>
                )}
              </Typography>
              <Tooltip title="Remove this date">
                <span>
                  <IconButton
                    size="small"
                    color="error"
                    aria-label={`Remove unavailable date ${d.unavailable_date}`}
                    disabled={deletingId === d.id}
                    onClick={() => void handleDeleteDate(d.id)}
                  >
                    {deletingId === d.id ? (
                      <CircularProgress size={14} color="inherit" />
                    ) : (
                      <DeleteIcon fontSize="small" />
                    )}
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          ))}
        </Stack>
      )}

      {/* Add new date form */}
      <Divider sx={{ mb: 1.5 }} />
      <Typography variant="caption" fontWeight={600} color="text.secondary">
        Add Unavailable Date
      </Typography>
      {addError && (
        <Alert severity="error" sx={{ mt: 1, mb: 1 }} onClose={() => setAddError("")}>
          {addError}
        </Alert>
      )}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 1 }} alignItems="flex-start">
        <TextField
          label="Date"
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ minWidth: 160 }}
        />
        <TextField
          label="Reason (optional)"
          value={newReason}
          onChange={(e) => setNewReason(e.target.value)}
          size="small"
          placeholder="e.g. Maintenance"
          sx={{ flex: 1, minWidth: 180 }}
        />
        <Button
          variant="contained"
          size="small"
          onClick={() => void handleAddDate()}
          disabled={adding}
          startIcon={adding ? <CircularProgress size={14} color="inherit" /> : <AddIcon />}
          sx={{ whiteSpace: "nowrap", alignSelf: { xs: "flex-start", sm: "center" } }}
        >
          Add Date
        </Button>
      </Stack>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main Client Component
// ---------------------------------------------------------------------------

/**
 * Admin Courts client component.
 *
 * Features:
 *   - List courts in a table with name, operating hours summary, status chip
 *   - Add Court button → opens dialog (React Hook Form + courtSchema)
 *   - Edit button per row → pre-filled dialog
 *   - Toggle Status button per row (available ↔ unavailable)
 *   - Expandable Unavailable Dates section per row
 *   - Snackbar for success/error feedback
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
 */
export default function AdminCourtsClient({ initialCourts }: Props) {
  const [courts, setCourts] = useState<AdminCourt[]>(initialCourts);
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminCourt | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [snack, setSnack] = useState<{ message: string; severity: "success" | "error" | "info" } | null>(null);

  // ---- Helpers ---------------------------------------------------------------

  const showSnack = useCallback((message: string, severity: "success" | "error" | "info" = "success") => {
    setSnack({ message, severity });
  }, []);

  function toggleExpanded(courtId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(courtId)) {
        next.delete(courtId);
      } else {
        next.add(courtId);
      }
      return next;
    });
  }

  // ---- Dialog handlers -------------------------------------------------------

  function openAddDialog() {
    setDialogMode("add");
    setEditTarget(null);
    setDialogOpen(true);
  }

  function openEditDialog(court: AdminCourt) {
    setDialogMode("edit");
    setEditTarget(court);
    setDialogOpen(true);
  }

  function handleCourtSaved(savedCourt: AdminCourt) {
    setCourts((prev) => {
      const idx = prev.findIndex((c) => c.id === savedCourt.id);
      if (idx >= 0) {
        // Update existing
        const next = [...prev];
        next[idx] = savedCourt;
        return next;
      }
      // Append new, re-sort by name
      return [...prev, savedCourt].sort((a, b) => a.name.localeCompare(b.name));
    });
    showSnack(
      dialogMode === "add" ? "Court created successfully." : "Court updated successfully.",
      "success"
    );
  }

  // ---- Status toggle ---------------------------------------------------------

  async function handleToggleStatus(court: AdminCourt) {
    if (togglingId) return;
    const newStatus = court.status === "available" ? "unavailable" : "available";
    setTogglingId(court.id);
    try {
      const res = await fetch(`/api/courts/${court.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({} as { error?: string }))) as { error?: string };
        showSnack(err.error ?? "Failed to update status.", "error");
        return;
      }

      const json = (await res.json()) as { court: AdminCourt };
      setCourts((prev) =>
        prev.map((c) =>
          c.id === court.id
            ? { ...json.court, court_unavailable_dates: court.court_unavailable_dates }
            : c
        )
      );
      showSnack(
        `Court marked as ${newStatus}.`,
        "success"
      );
    } catch {
      showSnack("An unexpected error occurred.", "error");
    } finally {
      setTogglingId(null);
    }
  }

  // ---- Unavailable dates change -----------------------------------------------

  function handleDatesChanged(courtId: string, dates: UnavailableDate[]) {
    setCourts((prev) =>
      prev.map((c) =>
        c.id === courtId ? { ...c, court_unavailable_dates: dates } : c
      )
    );
  }

  // ---- Render ----------------------------------------------------------------

  return (
    <Box>
      {/* ===================================================================
          Header Row
      =================================================================== */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h6" component="h2" fontWeight={700}>
          All Courts{" "}
          <Typography component="span" variant="body2" color="text.secondary" fontWeight={400}>
            ({courts.length})
          </Typography>
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={openAddDialog}
          aria-label="Add new court"
        >
          Add Court
        </Button>
      </Box>

      {/* ===================================================================
          Courts Table
      =================================================================== */}
      <Card>
        <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
          {courts.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 6, textAlign: "center" }}>
              No courts found. Add one to get started.
            </Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
              <Table aria-label="Courts table">
                <TableHead>
                  <TableRow sx={{ bgcolor: "grey.100" }}>
                    <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Operating Hours</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: "center" }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {courts.map((court) => {
                    const isExpanded = expandedIds.has(court.id);
                    const isToggling = togglingId === court.id;

                    return (
                      <React.Fragment key={court.id}>
                        {/* Main row */}
                        <TableRow
                          hover
                          sx={{ "& td": { borderBottom: isExpanded ? 0 : undefined } }}
                        >
                          <TableCell>
                            <Typography variant="body2" fontWeight={600}>
                              {court.name}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.75rem" }}>
                              {summariseHours(court.operating_hours)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={court.status === "available" ? "Available" : "Unavailable"}
                              color={court.status === "available" ? "success" : "error"}
                              size="small"
                            />
                          </TableCell>
                          <TableCell align="center">
                            <Box sx={{ display: "flex", justifyContent: "center", gap: 0.5, flexWrap: "wrap" }}>
                              {/* Edit */}
                              <Tooltip title="Edit court">
                                <IconButton
                                  size="small"
                                  color="primary"
                                  aria-label={`Edit ${court.name}`}
                                  onClick={() => openEditDialog(court)}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>

                              {/* Toggle status */}
                              <Tooltip
                                title={
                                  court.status === "available"
                                    ? "Mark as Unavailable"
                                    : "Mark as Available"
                                }
                              >
                                <span>
                                  <IconButton
                                    size="small"
                                    color="warning"
                                    aria-label={`Toggle status of ${court.name}`}
                                    disabled={isToggling}
                                    onClick={() => void handleToggleStatus(court)}
                                  >
                                    {isToggling ? (
                                      <CircularProgress size={16} color="inherit" />
                                    ) : (
                                      <SwapHorizIcon fontSize="small" />
                                    )}
                                  </IconButton>
                                </span>
                              </Tooltip>

                              {/* Unavailable dates */}
                              <Tooltip title={isExpanded ? "Hide unavailable dates" : "Manage unavailable dates"}>
                                <IconButton
                                  size="small"
                                  aria-label={`${isExpanded ? "Hide" : "Show"} unavailable dates for ${court.name}`}
                                  onClick={() => toggleExpanded(court.id)}
                                >
                                  <CalendarMonthIcon fontSize="small" />
                                  {isExpanded ? (
                                    <ExpandLessIcon fontSize="small" sx={{ ml: -0.5 }} />
                                  ) : (
                                    <ExpandMoreIcon fontSize="small" sx={{ ml: -0.5 }} />
                                  )}
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </TableCell>
                        </TableRow>

                        {/* Expandable unavailable dates row */}
                        <TableRow>
                          <TableCell colSpan={4} sx={{ p: 0, border: 0 }}>
                            <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                              <UnavailableDatesPanel
                                court={court}
                                onDatesChanged={handleDatesChanged}
                                onSnack={(msg, sev) => showSnack(msg, sev)}
                              />
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* ===================================================================
          Court Form Dialog
      =================================================================== */}
      <CourtFormDialog
        open={dialogOpen}
        mode={dialogMode}
        court={editTarget}
        onClose={() => setDialogOpen(false)}
        onSaved={handleCourtSaved}
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
