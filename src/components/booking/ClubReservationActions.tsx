"use client";

/**
 * ClubReservationActions
 *
 * Client component rendered on the club reservation detail page.
 * Offers two actions:
 *   1. Cancel the entire reservation
 *   2. Reduce the number of courts (remove specific courts)
 *
 * Both actions are only allowed up to the day before the reservation.
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

import CancelIcon from "@mui/icons-material/Cancel";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";

interface Court {
  id: string;
  name: string;
}

interface Props {
  reservationId: string;
  reservationDate: string; // "YYYY-MM-DD"
  courts: Court[];
}

export default function ClubReservationActions({ reservationId, reservationDate, courts }: Props) {
  const router = useRouter();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [reduceDialogOpen, setReduceDialogOpen] = useState(false);

  // Which courts to KEEP (unchecking removes them)
  const [keepIds, setKeepIds] = useState<string[]>(courts.map((c) => c.id));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleKeep = (id: string) => {
    setKeepIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const removedCount = courts.length - keepIds.length;

  // ---------------------------------------------------------------------------
  // Cancel
  // ---------------------------------------------------------------------------

  const handleCancel = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/club/${reservationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? "Failed to cancel reservation");
        return;
      }

      setCancelDialogOpen(false);
      router.refresh();
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [reservationId, router]);

  // ---------------------------------------------------------------------------
  // Reduce courts
  // ---------------------------------------------------------------------------

  const handleReduceCourts = useCallback(async () => {
    if (keepIds.length === 0) {
      setError("You must keep at least one court. To cancel entirely, use the Cancel button.");
      return;
    }
    if (keepIds.length >= courts.length) {
      setError("Please uncheck at least one court to reduce the reservation.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/club/${reservationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reduce_courts", keepCourtIds: keepIds }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? "Failed to reduce courts");
        return;
      }

      setReduceDialogOpen(false);
      router.refresh();
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [reservationId, keepIds, courts.length, router]);

  return (
    <Box sx={{ mb: 3 }}>
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
          Manage Reservation
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Changes must be made before <strong>{formatDateDisplay(reservationDate)}</strong>.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
          {/* Reduce courts — only if more than 1 court */}
          {courts.length > 1 && (
            <Button
              variant="outlined"
              color="warning"
              startIcon={<RemoveCircleOutlineIcon />}
              onClick={() => { setError(null); setReduceDialogOpen(true); }}
              size="small"
            >
              Reduce Courts
            </Button>
          )}

          {/* Cancel */}
          <Button
            variant="outlined"
            color="error"
            startIcon={<CancelIcon />}
            onClick={() => { setError(null); setCancelDialogOpen(true); }}
            size="small"
          >
            Cancel Reservation
          </Button>
        </Box>
      </Paper>

      {/* ===================================================================
          Cancel Dialog
      ==================================================================== */}
      <Dialog open={cancelDialogOpen} onClose={() => !loading && setCancelDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Cancel Reservation</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to cancel this club reservation? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelDialogOpen(false)} disabled={loading}>
            Keep Reservation
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleCancel}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <CancelIcon />}
          >
            {loading ? "Cancelling…" : "Yes, Cancel"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===================================================================
          Reduce Courts Dialog
      ==================================================================== */}
      <Dialog
        open={reduceDialogOpen}
        onClose={() => !loading && setReduceDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Reduce Reserved Courts</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Uncheck the courts you want to <strong>remove</strong> from the reservation.
            At least one court must remain.
          </DialogContentText>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <FormGroup>
            {courts.map((court) => (
              <FormControlLabel
                key={court.id}
                control={
                  <Checkbox
                    checked={keepIds.includes(court.id)}
                    onChange={() => toggleKeep(court.id)}
                    color="primary"
                    disabled={loading}
                  />
                }
                label={court.name}
              />
            ))}
          </FormGroup>

          {removedCount > 0 && (
            <Box sx={{ mt: 2, display: "flex", alignItems: "center", gap: 1 }}>
              <Chip
                label={`${removedCount} court${removedCount !== 1 ? "s" : ""} will be removed`}
                color="warning"
                size="small"
              />
              <Chip
                label={`${keepIds.length} remaining`}
                color="primary"
                size="small"
                variant="outlined"
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setReduceDialogOpen(false); setKeepIds(courts.map((c) => c.id)); }} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleReduceCourts}
            disabled={loading || removedCount === 0 || keepIds.length === 0}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RemoveCircleOutlineIcon />}
          >
            {loading ? "Saving…" : `Remove ${removedCount} Court${removedCount !== 1 ? "s" : ""}`}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function formatDateDisplay(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  // Show the day BEFORE
  date.setDate(date.getDate() - 1);
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
