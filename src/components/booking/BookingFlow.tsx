"use client";

/**
 * BookingFlow — Multi-step booking wizard
 *
 * Steps:
 *   1. DatePicker    — select a booking date (disables past dates)
 *   2. CourtSelector — choose a court from available courts
 *   3. SlotPicker    — select an available time slot
 *   4. ConfirmStep   — review and confirm the booking
 *
 * Only members can save bookings. Admins and super_admins who reach this
 * page see an informational notice instead of the wizard.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.5, 7.6
 */

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stepper from "@mui/material/Stepper";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import SportsTennisIcon from "@mui/icons-material/SportsTennis";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TimeSlot {
  start_time: string; // "HH:MM"
  end_time: string;   // "HH:MM"
}

interface UnavailableDate {
  id: string;
  unavailable_date: string; // "YYYY-MM-DD"
}

interface Court {
  id: string;
  name: string;
  status: string;
  operating_hours: Record<string, { open: string; close: string }> | null;
  court_unavailable_dates: UnavailableDate[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = ["Select Date", "Choose Court", "Select Slot", "Confirm"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns today's date as "YYYY-MM-DD" (local time). */
function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Format a "YYYY-MM-DD" string for display. */
function formatDate(iso: string): string {
  if (!iso) return "";
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
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

// ---------------------------------------------------------------------------
// Step 1: DatePicker
// ---------------------------------------------------------------------------

interface DatePickerStepProps {
  selectedDate: string;
  unavailableDates: string[]; // "YYYY-MM-DD" list across all courts
  onChange: (date: string) => void;
}

function DatePickerStep({
  selectedDate,
  unavailableDates,
  onChange,
}: DatePickerStepProps) {
  const today = todayISO();

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          mb: 2,
          color: "primary.main",
        }}
      >
        <CalendarTodayIcon />
        <Typography variant="h6" component="h2" fontWeight={600}>
          Select a Date
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Choose the date you'd like to book. Past dates are not available.
      </Typography>

      <Paper
        variant="outlined"
        sx={{
          p: 3,
          display: "inline-block",
          borderRadius: 2,
          borderColor: selectedDate ? "primary.main" : "divider",
        }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Booking Date
        </Typography>
        <input
          type="date"
          value={selectedDate}
          min={today}
          onChange={(e) => onChange(e.target.value)}
          style={{
            fontSize: "1.1rem",
            padding: "8px 12px",
            borderRadius: "8px",
            border: "1px solid #ccc",
            fontFamily: "inherit",
            color: "#1a1a1a",
            backgroundColor: "#fff",
            cursor: "pointer",
            outline: "none",
            width: "220px",
          }}
          aria-label="Select booking date"
        />
        {selectedDate && (
          <Typography
            variant="body2"
            color="primary.main"
            fontWeight={600}
            sx={{ mt: 1.5 }}
          >
            {formatDate(selectedDate)}
          </Typography>
        )}
      </Paper>

      {unavailableDates.length > 0 && selectedDate && (
        <Box sx={{ mt: 2 }}>
          {unavailableDates.includes(selectedDate) && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              This date has limited court availability. Some courts may be
              unavailable.
            </Alert>
          )}
        </Box>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Step 2: CourtSelector
// ---------------------------------------------------------------------------

interface CourtSelectorStepProps {
  courts: Court[];
  selectedDate: string;
  selectedCourtId: string;
  loading: boolean;
  onSelect: (courtId: string) => void;
}

function CourtSelectorStep({
  courts,
  selectedDate,
  selectedCourtId,
  loading,
  onSelect,
}: CourtSelectorStepProps) {
  // Filter out unavailable courts and courts that are unavailable on the selected date
  const availableCourts = courts.filter((c) => {
    if (c.status !== "available") return false;
    if (
      selectedDate &&
      c.court_unavailable_dates?.some(
        (ud) => ud.unavailable_date === selectedDate
      )
    ) {
      return false;
    }
    return true;
  });

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          mb: 2,
          color: "primary.main",
        }}
      >
        <SportsTennisIcon />
        <Typography variant="h6" component="h2" fontWeight={600}>
          Choose a Court
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Select a court for{" "}
        <strong>{selectedDate ? formatDate(selectedDate) : "your chosen date"}</strong>.
      </Typography>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress color="primary" aria-label="Loading courts" />
        </Box>
      ) : availableCourts.length === 0 ? (
        <Alert severity="info">
          No courts are available on this date. Please select a different date.
        </Alert>
      ) : (
        <Grid container spacing={2}>
          {availableCourts.map((court) => {
            const isSelected = court.id === selectedCourtId;
            return (
              <Grid item xs={12} sm={6} key={court.id}>
                <Card
                  onClick={() => onSelect(court.id)}
                  sx={{
                    cursor: "pointer",
                    border: "2px solid",
                    borderColor: isSelected ? "primary.main" : "divider",
                    bgcolor: isSelected ? "primary.light" : "background.paper",
                    transition: "all 0.2s ease",
                    "&:hover": {
                      borderColor: "primary.main",
                      boxShadow: 3,
                    },
                  }}
                  role="button"
                  aria-pressed={isSelected}
                  aria-label={`Select court: ${court.name}`}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(court.id);
                    }
                  }}
                >
                  <CardContent sx={{ pb: "16px !important" }}>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <Typography variant="subtitle1" fontWeight={700}>
                        {court.name}
                      </Typography>
                      {isSelected && (
                        <CheckCircleOutlineIcon
                          color="primary"
                          fontSize="small"
                          aria-hidden="true"
                        />
                      )}
                    </Box>
                    <Chip
                      label="Available"
                      size="small"
                      color="success"
                      variant="outlined"
                      sx={{ mt: 1 }}
                    />
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Step 3: SlotPicker
// ---------------------------------------------------------------------------

interface SlotPickerStepProps {
  slots: TimeSlot[];
  selectedSlot: TimeSlot | null;
  loading: boolean;
  error: string | null;
  onSelect: (slot: TimeSlot) => void;
}

function SlotPickerStep({
  slots,
  selectedSlot,
  loading,
  error,
  onSelect,
}: SlotPickerStepProps) {
  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          mb: 2,
          color: "primary.main",
        }}
      >
        <AccessTimeIcon />
        <Typography variant="h6" component="h2" fontWeight={600}>
          Select a Time Slot
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Choose an available 1-hour time slot.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress color="primary" aria-label="Loading available slots" />
        </Box>
      ) : slots.length === 0 ? (
        <Alert severity="info">
          No time slots are available for this court and date. Please go back
          and select a different court or date.
        </Alert>
      ) : (
        <Grid container spacing={2}>
          {slots.map((slot) => {
            const isSelected =
              selectedSlot?.start_time === slot.start_time &&
              selectedSlot?.end_time === slot.end_time;
            return (
              <Grid item xs={6} sm={4} md={3} key={slot.start_time}>
                <Paper
                  onClick={() => onSelect(slot)}
                  sx={{
                    p: 2,
                    textAlign: "center",
                    cursor: "pointer",
                    border: "2px solid",
                    borderColor: isSelected ? "primary.main" : "divider",
                    bgcolor: isSelected ? "primary.light" : "background.paper",
                    borderRadius: 2,
                    transition: "all 0.2s ease",
                    "&:hover": {
                      borderColor: "primary.main",
                      boxShadow: 2,
                    },
                  }}
                  role="button"
                  aria-pressed={isSelected}
                  aria-label={`Select time slot: ${formatTime(slot.start_time)} to ${formatTime(slot.end_time)}`}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(slot);
                    }
                  }}
                >
                  <Typography variant="body2" fontWeight={700} color={isSelected ? "primary.dark" : "text.primary"}>
                    {formatTime(slot.start_time)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    to {formatTime(slot.end_time)}
                  </Typography>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Step 4: ConfirmStep
// ---------------------------------------------------------------------------

interface ConfirmStepProps {
  selectedDate: string;
  selectedCourt: Court | null;
  selectedSlot: TimeSlot | null;
  submitting: boolean;
  conflictError: string | null;
}

function ConfirmStep({
  selectedDate,
  selectedCourt,
  selectedSlot,
  submitting,
  conflictError,
}: ConfirmStepProps) {
  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          mb: 2,
          color: "primary.main",
        }}
      >
        <CheckCircleOutlineIcon />
        <Typography variant="h6" component="h2" fontWeight={600}>
          Confirm Your Booking
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Please review your booking details before confirming.
      </Typography>

      {conflictError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {conflictError}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: "hidden" }}>
        <Box sx={{ p: 2.5, bgcolor: "primary.main", color: "#fff" }}>
          <Typography variant="subtitle1" fontWeight={700}>
            Booking Summary
          </Typography>
        </Box>
        <Box sx={{ p: 3 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
            {/* Date */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <CalendarTodayIcon color="primary" fontSize="small" aria-hidden="true" />
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Date
                </Typography>
                <Typography variant="body1" fontWeight={600}>
                  {selectedDate ? formatDate(selectedDate) : "—"}
                </Typography>
              </Box>
            </Box>

            <Divider />

            {/* Court */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <SportsTennisIcon color="primary" fontSize="small" aria-hidden="true" />
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Court
                </Typography>
                <Typography variant="body1" fontWeight={600}>
                  {selectedCourt?.name ?? "—"}
                </Typography>
              </Box>
            </Box>

            <Divider />

            {/* Time Slot */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <AccessTimeIcon color="primary" fontSize="small" aria-hidden="true" />
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Time Slot
                </Typography>
                <Typography variant="body1" fontWeight={600}>
                  {selectedSlot
                    ? `${formatTime(selectedSlot.start_time)} – ${formatTime(selectedSlot.end_time)}`
                    : "—"}
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>
      </Paper>

      {submitting && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            mt: 3,
          }}
          role="status"
          aria-live="polite"
        >
          <CircularProgress size={20} color="primary" />
          <Typography variant="body2" color="text.secondary">
            Creating your booking…
          </Typography>
        </Box>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main BookingFlow component
// ---------------------------------------------------------------------------

export default function BookingFlow() {
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

  // ----- Wizard state -----
  const [activeStep, setActiveStep] = useState(0);

  // ----- Selection state -----
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedCourtId, setSelectedCourtId] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

  // ----- Data state -----
  const [courts, setCourts] = useState<Court[]>([]);
  const [slots, setSlots] = useState<TimeSlot[]>([]);

  // ----- Loading / error state -----
  const [loadingCourts, setLoadingCourts] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ----- Derived -----
  const selectedCourt = courts.find((c) => c.id === selectedCourtId) ?? null;

  // All unavailable dates across all courts (for date hint)
  const allUnavailableDates = courts.flatMap((c) =>
    (c.court_unavailable_dates ?? []).map((ud) => ud.unavailable_date)
  );

  // ---------------------------------------------------------------------------
  // Data fetchers
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

  const fetchSlots = useCallback(
    async (courtId: string, date: string) => {
      setLoadingSlots(true);
      setSlotError(null);
      setSlots([]);
      try {
        const params = new URLSearchParams({ courtId, date });
        const res = await fetch(`/api/bookings/slots?${params.toString()}`);
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setSlotError(
            err.error ?? "Failed to load available slots. Please try again."
          );
          return;
        }
        const data = (await res.json()) as { slots: TimeSlot[] };
        setSlots(data.slots ?? []);
      } catch {
        setSlotError("Failed to load available slots. Please try again.");
      } finally {
        setLoadingSlots(false);
      }
    },
    []
  );

  // ---------------------------------------------------------------------------
  // Navigation handlers
  // ---------------------------------------------------------------------------

  const handleNext = useCallback(async () => {
    setSubmitError(null);

    if (activeStep === 0) {
      // Step 1 → Step 2: fetch courts
      await fetchCourts();
      setSelectedCourtId("");
      setSelectedSlot(null);
      setActiveStep(1);
    } else if (activeStep === 1) {
      // Step 2 → Step 3: fetch fresh slots
      await fetchSlots(selectedCourtId, selectedDate);
      setSelectedSlot(null);
      setConflictError(null);
      setActiveStep(2);
    } else if (activeStep === 2) {
      // Step 3 → Step 4: just move forward (no extra fetch needed)
      setConflictError(null);
      setActiveStep(3);
    }
  }, [activeStep, fetchCourts, fetchSlots, selectedCourtId, selectedDate]);

  const handleBack = useCallback(() => {
    setSubmitError(null);
    setConflictError(null);
    setSlotError(null);

    if (activeStep === 2) {
      // Returning to court selection: clear slot
      setSelectedSlot(null);
    }

    setActiveStep((prev) => prev - 1);
  }, [activeStep]);

  // ---------------------------------------------------------------------------
  // Confirm / submit
  // ---------------------------------------------------------------------------

  const handleConfirm = useCallback(async () => {
    if (!selectedSlot || !selectedCourtId || !selectedDate) return;

    setSubmitting(true);
    setConflictError(null);
    setSubmitError(null);

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courtId: selectedCourtId,
          bookingDate: selectedDate,
          startTime: selectedSlot.start_time,
          endTime: selectedSlot.end_time,
        }),
      });

      if (res.status === 409) {
        // Slot was taken between selection and confirmation (Req 7.5)
        setSelectedSlot(null);
        setConflictError(
          "This slot has just been booked. Please select a different slot."
        );
        // Fetch fresh slots and return to SlotPicker
        await fetchSlots(selectedCourtId, selectedDate);
        setActiveStep(2);
        return;
      }

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as {
          message?: string;
          error?: string;
        };
        setSubmitError(
          errData.message ??
            errData.error ??
            "Failed to create booking. Please try again."
        );
        return;
      }

      // Success — redirect to booking detail page (Req 7.6)
      const data = (await res.json()) as {
        booking: { id: string };
      };
      router.push(`/member/bookings/${data.booking.id}`);
    } catch {
      setSubmitError("Failed to create booking. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [
    selectedSlot,
    selectedCourtId,
    selectedDate,
    fetchSlots,
    router,
  ]);

  // ---------------------------------------------------------------------------
  // Step validation — determines if "Next" button is enabled
  // ---------------------------------------------------------------------------

  const canProceed =
    (activeStep === 0 && selectedDate.length > 0) ||
    (activeStep === 1 && selectedCourtId.length > 0) ||
    (activeStep === 2 && selectedSlot !== null);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Show spinner while the session role is being resolved
  if (!roleChecked) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress aria-label="Checking session…" />
      </Box>
    );
  }

  return (
    <Box>
      {/* ===================================================================
          MUI Stepper — progress indicator (Req 7.1)
      ==================================================================== */}
      <Stepper
        activeStep={activeStep}
        alternativeLabel
        sx={{ mb: 4 }}
        aria-label="Booking steps"
      >
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {/* ===================================================================
          Step content
      ==================================================================== */}
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 2.5, sm: 4 },
          borderRadius: 3,
          minHeight: 320,
        }}
      >
        {/* Global submit error (non-409 failures) */}
        {submitError && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setSubmitError(null)}>
            {submitError}
          </Alert>
        )}

        {/* Step 1 */}
        {activeStep === 0 && (
          <DatePickerStep
            selectedDate={selectedDate}
            unavailableDates={allUnavailableDates}
            onChange={(date) => {
              setSelectedDate(date);
              // Reset downstream selections on date change
              setSelectedCourtId("");
              setSelectedSlot(null);
            }}
          />
        )}

        {/* Step 2 */}
        {activeStep === 1 && (
          <CourtSelectorStep
            courts={courts}
            selectedDate={selectedDate}
            selectedCourtId={selectedCourtId}
            loading={loadingCourts}
            onSelect={(id) => {
              setSelectedCourtId(id);
              setSelectedSlot(null);
            }}
          />
        )}

        {/* Step 3 */}
        {activeStep === 2 && (
          <SlotPickerStep
            slots={slots}
            selectedSlot={selectedSlot}
            loading={loadingSlots}
            error={slotError ?? conflictError}
            onSelect={(slot) => {
              setSelectedSlot(slot);
              setConflictError(null);
            }}
          />
        )}

        {/* Step 4 */}
        {activeStep === 3 && (
          <ConfirmStep
            selectedDate={selectedDate}
            selectedCourt={selectedCourt}
            selectedSlot={selectedSlot}
            submitting={submitting}
            conflictError={conflictError}
          />
        )}
      </Paper>

      {/* ===================================================================
          Navigation buttons
      ==================================================================== */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mt: 3,
          gap: 2,
        }}
      >
        {/* Back */}
        <Button
          variant="outlined"
          onClick={handleBack}
          disabled={activeStep === 0 || submitting}
          startIcon={<ArrowBackIcon />}
          aria-label="Go back to previous step"
        >
          Back
        </Button>

        {/* Next / Confirm */}
        {activeStep < STEPS.length - 1 ? (
          <Button
            variant="contained"
            color="primary"
            onClick={handleNext}
            disabled={!canProceed || loadingCourts || loadingSlots}
            endIcon={
              loadingCourts || loadingSlots ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <ArrowForwardIcon />
              )
            }
            aria-label="Proceed to next step"
          >
            Next
          </Button>
        ) : (
          <Button
            variant="contained"
            color="primary"
            onClick={handleConfirm}
            disabled={submitting || !selectedSlot}
            endIcon={
              submitting ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <CheckCircleOutlineIcon />
              )
            }
            aria-label="Confirm and create booking"
          >
            {submitting ? "Booking…" : "Confirm Booking"}
          </Button>
        )}
      </Box>
    </Box>
  );
}
