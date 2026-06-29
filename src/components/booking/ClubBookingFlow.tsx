"use client";

/**
 * ClubBookingFlow — Club/Group court reservation wizard
 *
 * Rules:
 *   - Rate: ₱400 per court per hour
 *   - Minimum 4 hours (contiguous block, same start/end time for all courts)
 *   - Multiple courts can be selected (1 – all available)
 *   - Booking can only be cancelled (not rescheduled)
 *   - Courts reserved can be reduced up to the day before the booking date
 *   - On confirmation redirects to /member/bookings/club/:id
 *
 * Steps:
 *   1. Select Date & Time Range  (date + start time + duration ≥ 4 h)
 *   2. Select Courts             (multi-select from available courts)
 *   3. Confirm & Review          (shows total cost, rules summary)
 */

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import Grid from "@mui/material/Grid";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import GroupsIcon from "@mui/icons-material/Groups";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import SportsTennisIcon from "@mui/icons-material/SportsTennis";

import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Court {
  id: string;
  name: string;
  status: string;
  court_unavailable_dates: { id: string; unavailable_date: string }[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLUB_RATE_PER_COURT_PER_HOUR = 400; // ₱400
const MIN_HOURS = 4;
const STEPS = ["Date & Time", "Select Courts", "Confirm"];

const DURATION_OPTIONS = [
  { value: 4,  label: "4 hours" },
  { value: 5,  label: "5 hours" },
  { value: 6,  label: "6 hours" },
  { value: 7,  label: "7 hours" },
  { value: 8,  label: "8 hours" },
  { value: 9,  label: "9 hours" },
  { value: 10, label: "10 hours" },
];

/** Generate HH:MM start-time options every 30 minutes from 06:00 to 20:30 */
function generateStartTimes(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let h = 6; h <= 20; h++) {
    for (const m of [0, 30]) {
      const hStr = String(h).padStart(2, "0");
      const mStr = String(m).padStart(2, "0");
      const value = `${hStr}:${mStr}`;
      const suffix = h >= 12 ? "PM" : "AM";
      const hour = h % 12 === 0 ? 12 : h % 12;
      const label = `${hour}:${mStr} ${suffix}`;
      options.push({ value, label });
    }
  }
  return options;
}

const START_TIME_OPTIONS = generateStartTimes();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

function formatTime(hhmm: string): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Add `hours` to an "HH:MM" string, returns "HH:MM". */
function addHours(hhmm: string, hours: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const totalMins = h * 60 + m + hours * 60;
  return `${String(Math.floor(totalMins / 60)).padStart(2, "0")}:${String(totalMins % 60).padStart(2, "0")}`;
}

function formatCurrency(amount: number): string {
  return `₱${amount.toLocaleString("en-PH")}`;
}

// ---------------------------------------------------------------------------
// Step 1: Date & Time
// ---------------------------------------------------------------------------

interface DateTimeStepProps {
  selectedDate: string;
  startTime: string;
  duration: number;
  onChange: (field: "date" | "startTime" | "duration", value: string | number) => void;
}

function DateTimeStep({ selectedDate, startTime, duration, onChange }: DateTimeStepProps) {
  const today = todayISO();
  const endTime = startTime ? addHours(startTime, duration) : "";

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2, color: "primary.main" }}>
        <CalendarTodayIcon />
        <Typography variant="h6" component="h2" fontWeight={600}>Date &amp; Time</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Club reservations require a minimum of {MIN_HOURS} hours. All courts will be reserved
        for the same time block.
      </Typography>

      <Grid container spacing={2}>
        {/* Date */}
        <Grid item xs={12} sm={6}>
          <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
              Reservation Date
            </Typography>
            <input
              type="date"
              value={selectedDate}
              min={today}
              onChange={(e) => onChange("date", e.target.value)}
              style={{
                fontSize: "1rem",
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid #ccc",
                fontFamily: "inherit",
                color: "#1a1a1a",
                backgroundColor: "#fff",
                cursor: "pointer",
                width: "100%",
                boxSizing: "border-box",
              }}
              aria-label="Select reservation date"
            />
            {selectedDate && (
              <Typography variant="body2" color="primary.main" fontWeight={600} sx={{ mt: 1 }}>
                {formatDate(selectedDate)}
              </Typography>
            )}
          </Paper>
        </Grid>

        {/* Start time */}
        <Grid item xs={12} sm={6}>
          <TextField
            select
            label="Start Time"
            value={startTime}
            onChange={(e) => onChange("startTime", e.target.value)}
            fullWidth
            variant="outlined"
            helperText="When should the reservation begin?"
          >
            {START_TIME_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
            ))}
          </TextField>
        </Grid>

        {/* Duration */}
        <Grid item xs={12} sm={6}>
          <TextField
            select
            label="Duration"
            value={duration}
            onChange={(e) => onChange("duration", Number(e.target.value))}
            fullWidth
            variant="outlined"
            helperText={`Minimum ${MIN_HOURS} hours required`}
          >
            {DURATION_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
            ))}
          </TextField>
        </Grid>

        {/* Computed end time display */}
        {startTime && endTime && (
          <Grid item xs={12} sm={6}>
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, bgcolor: "primary.50" }}>
              <Typography variant="caption" color="text.secondary">End Time</Typography>
              <Typography variant="h6" fontWeight={700} color="primary.main">
                {formatTime(endTime)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatTime(startTime)} – {formatTime(endTime)} ({duration}h)
              </Typography>
            </Paper>
          </Grid>
        )}
      </Grid>

      {/* Cancellation policy notice */}
      <Alert severity="info" icon={<InfoOutlinedIcon />} sx={{ mt: 3 }}>
        <Typography variant="body2" fontWeight={600}>Cancellation Policy</Typography>
        <Typography variant="body2">
          Club reservations can only be cancelled, not rescheduled. You may also reduce
          the number of courts reserved up to the day before the event.
        </Typography>
      </Alert>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Court Selection (multi-select)
// ---------------------------------------------------------------------------

interface CourtSelectionStepProps {
  courts: Court[];
  selectedDate: string;
  selectedCourtIds: string[];
  loading: boolean;
  onToggle: (courtId: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}

function CourtSelectionStep({
  courts,
  selectedDate,
  selectedCourtIds,
  loading,
  onToggle,
  onSelectAll,
  onClearAll,
}: CourtSelectionStepProps) {
  const availableCourts = courts.filter((c) => {
    if (c.status !== "available") return false;
    if (selectedDate && c.court_unavailable_dates?.some((ud) => ud.unavailable_date === selectedDate)) return false;
    return true;
  });

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2, color: "primary.main" }}>
        <SportsTennisIcon />
        <Typography variant="h6" component="h2" fontWeight={600}>Select Courts</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Choose one or more courts for your club reservation on{" "}
        <strong>{selectedDate ? formatDate(selectedDate) : "your chosen date"}</strong>.
      </Typography>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress color="primary" aria-label="Loading courts" />
        </Box>
      ) : availableCourts.length === 0 ? (
        <Alert severity="info">No courts available on this date. Please go back and select another date.</Alert>
      ) : (
        <>
          {/* Quick selection buttons */}
          <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
            <Button size="small" variant="outlined" onClick={onSelectAll}>
              Select All ({availableCourts.length})
            </Button>
            {selectedCourtIds.length > 0 && (
              <Button size="small" variant="outlined" color="error" onClick={onClearAll}>
                Clear
              </Button>
            )}
            {selectedCourtIds.length > 0 && (
              <Chip
                label={`${selectedCourtIds.length} court${selectedCourtIds.length !== 1 ? "s" : ""} selected`}
                color="primary"
                size="small"
              />
            )}
          </Box>

          <Grid container spacing={2}>
            {availableCourts.map((court) => {
              const isSelected = selectedCourtIds.includes(court.id);
              return (
                <Grid item xs={12} sm={6} key={court.id}>
                  <Card
                    onClick={() => onToggle(court.id)}
                    sx={{
                      cursor: "pointer",
                      border: "2px solid",
                      borderColor: isSelected ? "primary.main" : "divider",
                      bgcolor: isSelected ? "primary.light" : "background.paper",
                      transition: "all 0.2s ease",
                      "&:hover": { borderColor: "primary.main", boxShadow: 3 },
                    }}
                    role="checkbox"
                    aria-checked={isSelected}
                    aria-label={`Select court: ${court.name}`}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(court.id); }
                    }}
                  >
                    <CardContent sx={{ pb: "16px !important" }}>
                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <Typography variant="subtitle1" fontWeight={700}>{court.name}</Typography>
                        <FormControlLabel
                          control={<Checkbox checked={isSelected} color="primary" tabIndex={-1} />}
                          label=""
                          onClick={(e) => e.stopPropagation()}
                          sx={{ m: 0 }}
                        />
                      </Box>
                      <Chip label="Available" size="small" color="success" variant="outlined" sx={{ mt: 1 }} />
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Confirm
// ---------------------------------------------------------------------------

interface ConfirmStepProps {
  selectedDate: string;
  startTime: string;
  duration: number;
  selectedCourts: Court[];
  submitting: boolean;
  error: string | null;
}

function ConfirmStep({ selectedDate, startTime, duration, selectedCourts, submitting, error }: ConfirmStepProps) {
  const endTime = startTime ? addHours(startTime, duration) : "";
  const totalCost = selectedCourts.length * duration * CLUB_RATE_PER_COURT_PER_HOUR;

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2, color: "primary.main" }}>
        <CheckCircleOutlineIcon />
        <Typography variant="h6" component="h2" fontWeight={600}>Confirm Reservation</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Review your club reservation details before confirming.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: "hidden", mb: 3 }}>
        <Box sx={{ p: 2.5, bgcolor: "primary.main", color: "#fff" }}>
          <Typography variant="subtitle1" fontWeight={700}>Reservation Summary</Typography>
        </Box>
        <Box sx={{ p: 3 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
            {/* Date */}
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
              <CalendarTodayIcon color="primary" fontSize="small" aria-hidden="true" />
              <Box>
                <Typography variant="caption" color="text.secondary">Date</Typography>
                <Typography variant="body1" fontWeight={600}>{selectedDate ? formatDate(selectedDate) : "—"}</Typography>
              </Box>
            </Box>
            <Divider />
            {/* Time */}
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
              <CalendarTodayIcon color="primary" fontSize="small" aria-hidden="true" />
              <Box>
                <Typography variant="caption" color="text.secondary">Time Block</Typography>
                <Typography variant="body1" fontWeight={600}>
                  {startTime ? `${formatTime(startTime)} – ${formatTime(endTime)} (${duration} hours)` : "—"}
                </Typography>
              </Box>
            </Box>
            <Divider />
            {/* Courts */}
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
              <SportsTennisIcon color="primary" fontSize="small" aria-hidden="true" />
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Courts Reserved ({selectedCourts.length})
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
                  {selectedCourts.map((c) => (
                    <Chip key={c.id} label={c.name} size="small" color="primary" variant="outlined" />
                  ))}
                </Box>
              </Box>
            </Box>
            <Divider />
            {/* Rate breakdown */}
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
              <GroupsIcon color="primary" fontSize="small" aria-hidden="true" />
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" color="text.secondary">Cost Breakdown</Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {selectedCourts.length} court{selectedCourts.length !== 1 ? "s" : ""} × {duration} hours × {formatCurrency(CLUB_RATE_PER_COURT_PER_HOUR)}/court/hr
                </Typography>
                <Typography variant="h5" fontWeight={800} color="primary.main" sx={{ mt: 0.5 }}>
                  {formatCurrency(totalCost)}
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>
      </Paper>

      <Alert severity="warning" icon={<InfoOutlinedIcon />}>
        <Typography variant="body2" fontWeight={600}>Cancellation Only</Typography>
        <Typography variant="body2">
          This reservation cannot be rescheduled. You may cancel or reduce the number of courts
          up to <strong>one day before</strong> the reservation date.
        </Typography>
      </Alert>

      {submitting && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mt: 3 }} role="status" aria-live="polite">
          <CircularProgress size={20} color="primary" />
          <Typography variant="body2" color="text.secondary">Creating your club reservation…</Typography>
        </Box>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main ClubBookingFlow
// ---------------------------------------------------------------------------

export default function ClubBookingFlow() {
  const router = useRouter();

  // ---------------------------------------------------------------------------
  // Session check — resolve whether the user is logged in so we can gate
  // the Confirm step appropriately (guests are prompted to log in).
  // ---------------------------------------------------------------------------
  const [roleChecked, setRoleChecked] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(() => {
      setRoleChecked(true);
    }).catch(() => setRoleChecked(true));
  }, []);

  const [activeStep, setActiveStep] = useState(0);

  // Step 1 state
  const [selectedDate, setSelectedDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState<number>(MIN_HOURS);

  // Step 2 state
  const [courts, setCourts] = useState<Court[]>([]);
  const [selectedCourtIds, setSelectedCourtIds] = useState<string[]>([]);
  const [loadingCourts, setLoadingCourts] = useState(false);

  // Step 3 state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const endTime = startTime ? addHours(startTime, duration) : "";

  const availableCourts = courts.filter((c) => {
    if (c.status !== "available") return false;
    if (selectedDate && c.court_unavailable_dates?.some((ud) => ud.unavailable_date === selectedDate)) return false;
    return true;
  });

  const selectedCourts = availableCourts.filter((c) => selectedCourtIds.includes(c.id));

  // ---------------------------------------------------------------------------
  // Fetchers
  // ---------------------------------------------------------------------------

  const fetchCourts = useCallback(async () => {
    setLoadingCourts(true);
    try {
      const res = await fetch("/api/courts");
      if (!res.ok) throw new Error("Failed to load courts");
      const data = (await res.json()) as { courts: Court[] };
      setCourts(data.courts ?? []);
    } catch {
      setCourts([]);
    } finally {
      setLoadingCourts(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  const handleDateTimeChange = (field: "date" | "startTime" | "duration", value: string | number) => {
    if (field === "date") setSelectedDate(value as string);
    if (field === "startTime") setStartTime(value as string);
    if (field === "duration") setDuration(value as number);
    // Reset court selection if date changes
    if (field === "date") setSelectedCourtIds([]);
  };

  const handleNext = useCallback(async () => {
    setSubmitError(null);
    if (activeStep === 0) {
      await fetchCourts();
      setSelectedCourtIds([]);
      setActiveStep(1);
    } else if (activeStep === 1) {
      setActiveStep(2);
    }
  }, [activeStep, fetchCourts]);

  const handleBack = useCallback(() => {
    setSubmitError(null);
    setActiveStep((prev) => prev - 1);
  }, []);

  const handleToggleCourt = (courtId: string) => {
    setSelectedCourtIds((prev) =>
      prev.includes(courtId) ? prev.filter((id) => id !== courtId) : [...prev, courtId]
    );
  };

  const handleSelectAll = () => {
    setSelectedCourtIds(availableCourts.map((c) => c.id));
  };

  const handleClearAll = () => setSelectedCourtIds([]);

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  const handleConfirm = useCallback(async () => {
    if (!selectedDate || !startTime || selectedCourtIds.length === 0) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/bookings/club", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationDate: selectedDate,
          startTime,
          endTime,
          durationHours: duration,
          courtIds: selectedCourtIds,
        }),
      });

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        setSubmitError(errData.message ?? errData.error ?? "Failed to create reservation. Please try again.");
        return;
      }

      const data = (await res.json()) as { reservationId: string };
      router.push(`/member/bookings/club/${data.reservationId}`);
    } catch {
      setSubmitError("Failed to create reservation. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [selectedDate, startTime, endTime, duration, selectedCourtIds, router]);

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  const canProceed =
    (activeStep === 0 && selectedDate.length > 0 && startTime.length > 0 && duration >= MIN_HOURS) ||
    (activeStep === 1 && selectedCourtIds.length > 0) ||
    activeStep === 2;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Show spinner while role is being resolved
  if (!roleChecked) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress aria-label="Checking session…" />
      </Box>
    );
  }

  return (
    <Box>
      <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4 }} aria-label="Club reservation steps">
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Paper variant="outlined" sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: 3, minHeight: 360 }}>
        {activeStep === 0 && (
          <DateTimeStep
            selectedDate={selectedDate}
            startTime={startTime}
            duration={duration}
            onChange={handleDateTimeChange}
          />
        )}
        {activeStep === 1 && (
          <CourtSelectionStep
            courts={courts}
            selectedDate={selectedDate}
            selectedCourtIds={selectedCourtIds}
            loading={loadingCourts}
            onToggle={handleToggleCourt}
            onSelectAll={handleSelectAll}
            onClearAll={handleClearAll}
          />
        )}
        {activeStep === 2 && (
          <ConfirmStep
            selectedDate={selectedDate}
            startTime={startTime}
            duration={duration}
            selectedCourts={selectedCourts}
            submitting={submitting}
            error={submitError}
          />
        )}
      </Paper>

      {/* Navigation buttons */}
      <Box sx={{ display: "flex", justifyContent: "space-between", mt: 3, gap: 2 }}>
        <Button
          variant="outlined"
          onClick={handleBack}
          disabled={activeStep === 0 || submitting}
          startIcon={<ArrowBackIcon />}
          aria-label="Go back"
        >
          Back
        </Button>

        {activeStep < STEPS.length - 1 ? (
          <Button
            variant="contained"
            color="primary"
            onClick={handleNext}
            disabled={!canProceed || loadingCourts}
            endIcon={loadingCourts ? <CircularProgress size={16} color="inherit" /> : <ArrowForwardIcon />}
            aria-label="Proceed to next step"
          >
            Next
          </Button>
        ) : (
          <Button
            variant="contained"
            color="primary"
            onClick={handleConfirm}
            disabled={submitting || selectedCourtIds.length === 0}
            endIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <CheckCircleOutlineIcon />}
            aria-label="Confirm club reservation"
          >
            {submitting ? "Reserving…" : "Confirm Reservation"}
          </Button>
        )}
      </Box>
    </Box>
  );
}
