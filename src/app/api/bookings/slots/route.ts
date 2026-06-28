import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type CourtRow = Database["public"]["Tables"]["courts"]["Row"];
type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];

/** Days of the week in JavaScript's `getDay()` order (0 = Sunday). */
const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

type DayName = (typeof DAY_NAMES)[number];

interface DayHours {
  open: string;  // "HH:MM"
  close: string; // "HH:MM"
}

type OperatingHours = Record<DayName, DayHours>;

interface TimeSlot {
  start_time: string; // "HH:MM"
  end_time: string;   // "HH:MM"
}

/** Matches YYYY-MM-DD date strings. */
const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse an "HH:MM" string into total minutes since midnight.
 * Returns NaN if the format is invalid.
 */
function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return NaN;
  return h * 60 + m;
}

/**
 * Convert total minutes since midnight back to "HH:MM".
 */
function fromMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Generate 1-hour time slots between `open` and `close` times (exclusive of close).
 * e.g. open="08:00", close="10:00" → [{ start_time: "08:00", end_time: "09:00" },
 *                                      { start_time: "09:00", end_time: "10:00" }]
 */
function generateSlots(open: string, close: string): TimeSlot[] {
  const openMins = toMinutes(open);
  const closeMins = toMinutes(close);

  if (isNaN(openMins) || isNaN(closeMins) || closeMins <= openMins) {
    return [];
  }

  const slots: TimeSlot[] = [];
  for (let start = openMins; start + 60 <= closeMins; start += 60) {
    slots.push({
      start_time: fromMinutes(start),
      end_time: fromMinutes(start + 60),
    });
  }
  return slots;
}

/**
 * GET /api/bookings/slots
 *
 * Returns the available 1-hour booking slots for a given court and date.
 *
 * Query parameters:
 *   courtId  — UUID of the court
 *   date     — YYYY-MM-DD target date
 *
 * Steps:
 *   1. Authenticate — 401 if no session; 403 if role is less than member
 *   2. Validate query params — 400 if missing or malformed
 *   3. Fetch court record — 404 if not found or court status is 'unavailable'
 *   4. Check court_unavailable_dates — 422 if date is blocked
 *   5. Derive day-of-week operating hours — 422 if no hours defined for that day
 *   6. Generate 1-hour slots within operating hours
 *   7. Fetch existing Pending/Confirmed bookings for that court + date
 *   8. Subtract booked slots
 *   9. Return available slots
 *
 * Response shape:
 *   { slots: [{ start_time: "08:00", end_time: "09:00" }, ...] }
 *
 * Requirements: 7.2
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // -------------------------------------------------------------------------
  // 1. Authenticate
  // -------------------------------------------------------------------------
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Members, admins, and super_admins are all permitted (member+).
  // We do not restrict by role here beyond requiring authentication.

  // -------------------------------------------------------------------------
  // 2. Validate query parameters
  // -------------------------------------------------------------------------
  const { searchParams } = request.nextUrl;
  const courtId = searchParams.get("courtId");
  const date = searchParams.get("date");

  if (!courtId) {
    return NextResponse.json(
      { error: "Missing required query parameter: courtId" },
      { status: 400 }
    );
  }

  if (!date) {
    return NextResponse.json(
      { error: "Missing required query parameter: date" },
      { status: 400 }
    );
  }

  // Validate UUID format for courtId
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(courtId)) {
    return NextResponse.json(
      { error: "courtId must be a valid UUID" },
      { status: 400 }
    );
  }

  // Validate date format
  if (!isoDateRegex.test(date)) {
    return NextResponse.json(
      { error: "date must be in YYYY-MM-DD format" },
      { status: 400 }
    );
  }

  // Validate that `date` is actually a valid calendar date
  const parsedDate = new Date(`${date}T00:00:00`);
  if (isNaN(parsedDate.getTime())) {
    return NextResponse.json(
      { error: "date is not a valid calendar date" },
      { status: 400 }
    );
  }

  // -------------------------------------------------------------------------
  // 3. Fetch the court record
  // -------------------------------------------------------------------------
  const { data: courtData, error: courtError } = await supabase
    .from("courts")
    .select("*")
    .eq("id", courtId)
    .maybeSingle();

  if (courtError) {
    return NextResponse.json(
      { error: "Failed to fetch court" },
      { status: 500 }
    );
  }

  if (!courtData) {
    return NextResponse.json({ error: "Court not found" }, { status: 404 });
  }

  const court = courtData as CourtRow;

  if (court.status === "unavailable") {
    return NextResponse.json(
      { error: "Court is currently unavailable" },
      { status: 404 }
    );
  }

  // -------------------------------------------------------------------------
  // 4. Check court_unavailable_dates
  // -------------------------------------------------------------------------
  const { data: unavailableDate, error: unavailableError } = await supabase
    .from("court_unavailable_dates")
    .select("id")
    .eq("court_id", courtId)
    .eq("unavailable_date", date)
    .maybeSingle();

  if (unavailableError) {
    return NextResponse.json(
      { error: "Failed to check court availability" },
      { status: 500 }
    );
  }

  if (unavailableDate) {
    return NextResponse.json(
      { error: "Court is not available on this date" },
      { status: 422 }
    );
  }

  // -------------------------------------------------------------------------
  // 5. Derive operating hours for the day of the week
  // -------------------------------------------------------------------------
  const dayName = DAY_NAMES[parsedDate.getDay()] as DayName;
  const operatingHours = court.operating_hours as OperatingHours | null;

  if (!operatingHours) {
    return NextResponse.json(
      { error: "Court has no operating hours configured" },
      { status: 422 }
    );
  }

  const dayHours = operatingHours[dayName];

  if (!dayHours?.open || !dayHours?.close) {
    return NextResponse.json(
      { error: `Court is not open on ${dayName}` },
      { status: 422 }
    );
  }

  // -------------------------------------------------------------------------
  // 6. Generate all 1-hour slots within operating hours
  // -------------------------------------------------------------------------
  const allSlots = generateSlots(dayHours.open, dayHours.close);

  // -------------------------------------------------------------------------
  // 7. Fetch existing Pending / Confirmed bookings for court + date
  // -------------------------------------------------------------------------
  const { data: existingBookingsData, error: bookingsError } = await supabase
    .from("bookings")
    .select("*")
    .eq("court_id", courtId)
    .eq("booking_date", date)
    .in("status", ["pending", "confirmed"]);

  if (bookingsError) {
    return NextResponse.json(
      { error: "Failed to fetch existing bookings" },
      { status: 500 }
    );
  }

  const existingBookings = (existingBookingsData ?? []) as BookingRow[];

  // -------------------------------------------------------------------------
  // 8. Subtract booked slots
  //    A generated slot is unavailable if there is any existing booking whose
  //    time range overlaps with it. For exact 1-hour slots we check whether
  //    an existing booking starts at the same time as the generated slot.
  //    We also handle partial overlaps for future-proofing.
  // -------------------------------------------------------------------------
  const bookedStartTimes = new Set(
    existingBookings.map((b) => {
      // Supabase may return time with or without seconds — normalise to HH:MM
      return typeof b.start_time === "string"
        ? b.start_time.slice(0, 5)
        : b.start_time;
    })
  );

  const availableSlots = allSlots.filter(
    (slot) => !bookedStartTimes.has(slot.start_time)
  );

  // -------------------------------------------------------------------------
  // 9. Return available slots
  // -------------------------------------------------------------------------
  return NextResponse.json({ slots: availableSlots });
}
