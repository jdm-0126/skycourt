/**
 * Property-based test: Slot Availability Is Accurate
 *
 * **Validates: Requirements 7.2**
 *
 * Property 10: Slot Availability Is Accurate
 *   For any court with defined operating hours H and a set of existing
 *   bookings B on a given date, the set of time slots returned by the
 *   slot-availability endpoint must equal exactly H \ B — i.e., only slots
 *   within operating hours that are not already booked (pending or confirmed).
 *   Cancelled bookings must NOT block slots.
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BookingStatus = "pending" | "confirmed" | "cancelled";

type BookingRow = {
  id: string;
  member_id: string;
  court_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  created_at: string;
  updated_at: string;
};

type DayHours = { open: string; close: string };
type OperatingHours = Record<string, DayHours>;

type CourtRow = {
  id: string;
  name: string;
  status: "available" | "unavailable";
  operating_hours: OperatingHours | null;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Module-level mutable state (shared by mock via closure)
// ---------------------------------------------------------------------------

let courtRecord: CourtRow | null = null;
let unavailableDates: Set<string> = new Set();
let bookingStore: Map<string, BookingRow> = new Map();

function resetState() {
  courtRecord = null;
  unavailableDates = new Set();
  bookingStore = new Map();
}

// ---------------------------------------------------------------------------
// Mock @/lib/supabase/server
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: {
            id: "member-user-id",
            app_metadata: { role: "member" },
            user_metadata: {},
          },
        },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      // -----------------------------------------------------------------------
      // courts table
      // -----------------------------------------------------------------------
      if (table === "courts") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_col: string, _id: string) => ({
              maybeSingle: vi.fn(async () => ({
                data: courtRecord,
                error: null,
              })),
            })),
          })),
        };
      }

      // -----------------------------------------------------------------------
      // court_unavailable_dates table
      // -----------------------------------------------------------------------
      if (table === "court_unavailable_dates") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_col1: string, _val1: string) => ({
              eq: vi.fn((_col2: string, dateVal: string) => ({
                maybeSingle: vi.fn(async () => {
                  const isBlocked = unavailableDates.has(dateVal);
                  return {
                    data: isBlocked ? { id: "blocked-id" } : null,
                    error: null,
                  };
                }),
              })),
            })),
          })),
        };
      }

      // -----------------------------------------------------------------------
      // bookings table
      // -----------------------------------------------------------------------
      if (table === "bookings") {
        // The route calls:
        //   .select('*').eq('court_id', ...).eq('booking_date', ...).in('status', [...])
        // We need to capture the court_id and booking_date filters, then apply
        // the .in() at the end.
        return {
          select: vi.fn(() => {
            let filteredByCourtId: BookingRow[] = Array.from(bookingStore.values());

            return {
              eq: vi.fn((_col1: string, courtIdVal: string) => {
                filteredByCourtId = filteredByCourtId.filter(
                  (b) => b.court_id === courtIdVal
                );

                return {
                  eq: vi.fn((_col2: string, dateVal: string) => {
                    const filteredByDate = filteredByCourtId.filter(
                      (b) => b.booking_date === dateVal
                    );

                    return {
                      in: vi.fn(async (_col3: string, statuses: string[]) => {
                        const statusSet = new Set(statuses);
                        const results = filteredByDate.filter((b) =>
                          statusSet.has(b.status)
                        );
                        return { data: results, error: null };
                      }),
                    };
                  }),
                };
              }),
            };
          }),
        };
      }

      throw new Error(`Unexpected table in mock: ${table}`);
    }),
  })),
}));

// ---------------------------------------------------------------------------
// Import route handler AFTER mocks
// ---------------------------------------------------------------------------

import { GET } from "@/app/api/bookings/slots/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

/** Build a NextRequest with query params for the slots endpoint */
function buildSlotsRequest(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/bookings/slots");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url.toString(), { method: "GET" });
}

/** Format hour number as "HH:00" */
function hourToTime(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

/**
 * Reference implementation for H \ B:
 * Returns the start_times of all available slots given open/close and
 * already-booked start times.
 */
function expectedAvailableStartTimes(
  open: string,
  close: string,
  bookedStartTimes: string[]
): string[] {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const fromMin = (mins: number) =>
    `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

  const openMins = toMin(open);
  const closeMins = toMin(close);
  const booked = new Set(bookedStartTimes);
  const slots: string[] = [];

  for (let s = openMins; s + 60 <= closeMins; s += 60) {
    const st = fromMin(s);
    if (!booked.has(st)) slots.push(st);
  }
  return slots;
}

/** Get all possible hourly start times for given open/close window */
function allSlotStartTimes(open: string, close: string): string[] {
  return expectedAvailableStartTimes(open, close, []);
}

/**
 * Known Monday date so tests can reliably anchor a specific day-of-week.
 * 2024-01-01 is a Monday (getDay() === 1) in local time on any timezone.
 */
const KNOWN_MONDAY = "2024-01-01";

/**
 * Lookup table: date strings such that new Date(date + "T00:00:00").getDay() === dayIndex.
 * Verified for week of Jan 1–7 2024.
 *   new Date("2024-01-07T00:00:00").getDay() === 0  (Sunday)
 *   new Date("2024-01-01T00:00:00").getDay() === 1  (Monday)
 *   new Date("2024-01-02T00:00:00").getDay() === 2  (Tuesday)
 *   ...
 *   new Date("2024-01-06T00:00:00").getDay() === 6  (Saturday)
 *
 * These are local-time midnight dates, so they're timezone-stable.
 */
const DATE_FOR_DAY_INDEX: readonly string[] = [
  "2024-01-07", // 0 = Sunday
  "2024-01-01", // 1 = Monday
  "2024-01-02", // 2 = Tuesday
  "2024-01-03", // 3 = Wednesday
  "2024-01-04", // 4 = Thursday
  "2024-01-05", // 5 = Friday
  "2024-01-06", // 6 = Saturday
];

/** Given a day index (0=Sun, 1=Mon, ..., 6=Sat), return a known date for that day */
function knownDateForDayIndex(dayIndex: number): string {
  return DATE_FOR_DAY_INDEX[dayIndex];
}

/** Build a minimal court with the given operating hours and status */
function makeCourtRecord(
  id: string,
  operatingHours: OperatingHours,
  status: "available" | "unavailable" = "available"
): CourtRow {
  return {
    id,
    name: "Test Court",
    status,
    operating_hours: operatingHours,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generate a valid UUID */
const uuidArb = fc.uuid();

/**
 * Generate operating hours for a specific day: open hour in [8..18],
 * close hour in (open..open+max_span], with close ≤ 23.
 */
const dayHoursArb: fc.Arbitrary<DayHours> = fc
  .integer({ min: 8, max: 18 })
  .chain((openHour) =>
    fc
      .integer({ min: openHour + 1, max: Math.min(openHour + 10, 23) })
      .map((closeHour) => ({
        open: hourToTime(openHour),
        close: hourToTime(closeHour),
      }))
  );

/** Pick a random day index (0-6) and generate its operating hours */
const dayWithHoursArb = fc
  .integer({ min: 0, max: 6 })
  .chain((dayIndex) =>
    dayHoursArb.map((hours) => ({ dayIndex, hours }))
  );

/** Generate a booking for a specific court, date, and set of valid start times */
function makeBookingArb(
  courtId: string,
  date: string,
  validStartTimes: string[]
): fc.Arbitrary<BookingRow> {
  return fc.record({
    id: uuidArb,
    member_id: uuidArb,
    court_id: fc.constant(courtId),
    booking_date: fc.constant(date),
    start_time: fc.constantFrom(...validStartTimes),
    end_time: fc.constant("00:00"), // end_time not used in slot logic
    status: fc.constantFrom("pending" as const, "confirmed" as const, "cancelled" as const),
    created_at: fc.constant(new Date().toISOString()),
    updated_at: fc.constant(new Date().toISOString()),
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetState();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Property 10: Slot Availability Is Accurate", () => {
  /**
   * **Validates: Requirements 7.2**
   *
   * Core H \ B property: for any court with any valid operating hours on a
   * specific day, and any set of 0–8 existing pending/confirmed/cancelled
   * bookings on that day, the returned slots must be exactly the full set of
   * hourly slots for that day's operating hours minus the pending/confirmed
   * booked start times.
   */
  it("returns exactly H \\ B: operating-hours slots minus pending/confirmed bookings", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        dayWithHoursArb,
        // Generate 0–8 bookings inline (status, and which slot index to use)
        fc.array(
          fc.record({
            id: uuidArb,
            memberId: uuidArb,
            slotOffset: fc.nat({ max: 100 }), // will be mod'd by slot count
            status: fc.constantFrom("pending" as const, "confirmed" as const, "cancelled" as const),
          }),
          { minLength: 0, maxLength: 8 }
        ),
        async (courtId, { dayIndex, hours }, rawBookings) => {
          const date = knownDateForDayIndex(dayIndex);
          const dayName = DAY_NAMES[dayIndex];

          const validStartTimes = allSlotStartTimes(hours.open, hours.close);
          // Skip degenerate case where no slots exist
          fc.pre(validStartTimes.length > 0);

          // Build booking rows from raw data
          const bookings: BookingRow[] = rawBookings.map((raw) => ({
            id: raw.id,
            member_id: raw.memberId,
            court_id: courtId,
            booking_date: date,
            start_time: validStartTimes[raw.slotOffset % validStartTimes.length],
            end_time: "00:00",
            status: raw.status,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }));

          // Seed state
          resetState();
          courtRecord = makeCourtRecord(courtId, { [dayName]: hours } as OperatingHours);
          for (const b of bookings) bookingStore.set(b.id, b);

          const req = buildSlotsRequest({ courtId, date });
          const res = await GET(req);

          expect(res.status).toBe(200);
          const body = await res.json();
          const returnedStartTimes: string[] = (body.slots as Array<{ start_time: string }>).map(
            (s) => s.start_time
          );

          // Compute expected using reference implementation
          const pendingConfirmedStartTimes = bookings
            .filter((b) => b.status === "pending" || b.status === "confirmed")
            .map((b) => b.start_time.slice(0, 5));

          const expected = expectedAvailableStartTimes(
            hours.open,
            hours.close,
            pendingConfirmedStartTimes
          );

          expect(returnedStartTimes.sort()).toEqual(expected.sort());
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 7.2**
   *
   * Pending/confirmed bookings block slots; cancelled bookings do not.
   */
  it("pending/confirmed slots are blocked; cancelled slots are available", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        dayHoursArb,
        async (courtId, hours) => {
          // Use a fixed Monday date for simplicity
          const date = KNOWN_MONDAY;
          const dayName = "monday";

          const validStartTimes = allSlotStartTimes(hours.open, hours.close);
          fc.pre(validStartTimes.length >= 2);

          // Pick two distinct slots: one to book as pending/confirmed, one as cancelled
          const [blockedStart, releasedStart] = validStartTimes.slice(0, 2);

          const pendingBooking: BookingRow = {
            id: "booking-blocked",
            member_id: "member-1",
            court_id: courtId,
            booking_date: date,
            start_time: blockedStart,
            end_time: "00:00",
            status: "pending",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          const cancelledBooking: BookingRow = {
            id: "booking-released",
            member_id: "member-1",
            court_id: courtId,
            booking_date: date,
            start_time: releasedStart,
            end_time: "00:00",
            status: "cancelled",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          resetState();
          courtRecord = makeCourtRecord(courtId, { [dayName]: hours } as OperatingHours);
          bookingStore.set(pendingBooking.id, pendingBooking);
          bookingStore.set(cancelledBooking.id, cancelledBooking);

          const req = buildSlotsRequest({ courtId, date });
          const res = await GET(req);

          expect(res.status).toBe(200);
          const body = await res.json();
          const returnedStartTimes: string[] = (body.slots as Array<{ start_time: string }>).map(
            (s) => s.start_time
          );

          // Blocked slot must NOT appear
          expect(returnedStartTimes).not.toContain(blockedStart);
          // Cancelled slot MUST appear (it was released)
          expect(returnedStartTimes).toContain(releasedStart);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 7.2**
   *
   * Empty booking set: when no bookings exist, all operating-hours slots are returned.
   */
  it("returns all operating-hours slots when no bookings exist", async () => {
    await fc.assert(
      fc.asyncProperty(uuidArb, dayHoursArb, async (courtId, hours) => {
        const date = KNOWN_MONDAY;
        const dayName = "monday";

        const validStartTimes = allSlotStartTimes(hours.open, hours.close);
        fc.pre(validStartTimes.length > 0);

        resetState();
        courtRecord = makeCourtRecord(courtId, { [dayName]: hours } as OperatingHours);
        // No bookings seeded

        const req = buildSlotsRequest({ courtId, date });
        const res = await GET(req);

        expect(res.status).toBe(200);
        const body = await res.json();
        const returnedStartTimes: string[] = (body.slots as Array<{ start_time: string }>).map(
          (s) => s.start_time
        );

        expect(returnedStartTimes.sort()).toEqual(validStartTimes.sort());
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 7.2**
   *
   * All returned slots fall within operating hours:
   *   start_time >= open AND end_time <= close.
   */
  it("all returned slots fall within operating hours", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        dayWithHoursArb,
        async (courtId, { dayIndex, hours }) => {
          const date = knownDateForDayIndex(dayIndex);
          const dayName = DAY_NAMES[dayIndex];

          const validStartTimes = allSlotStartTimes(hours.open, hours.close);
          fc.pre(validStartTimes.length > 0);

          resetState();
          courtRecord = makeCourtRecord(courtId, { [dayName]: hours } as OperatingHours);
          // No bookings — we want all slots returned

          const req = buildSlotsRequest({ courtId, date });
          const res = await GET(req);

          expect(res.status).toBe(200);
          const body = await res.json();

          const toMins = (t: string) => {
            const [h, m] = t.split(":").map(Number);
            return h * 60 + m;
          };

          const openMins = toMins(hours.open);
          const closeMins = toMins(hours.close);

          for (const slot of body.slots as Array<{ start_time: string; end_time: string }>) {
            const startMins = toMins(slot.start_time);
            const endMins = toMins(slot.end_time);

            // start >= open
            expect(startMins).toBeGreaterThanOrEqual(openMins);
            // end <= close
            expect(endMins).toBeLessThanOrEqual(closeMins);
            // slot duration is exactly 60 minutes
            expect(endMins - startMins).toBe(60);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 7.2**
   *
   * Unavailable court returns 404.
   */
  it("returns 404 when the court has status = 'unavailable'", async () => {
    await fc.assert(
      fc.asyncProperty(uuidArb, async (courtId) => {
        const date = KNOWN_MONDAY;

        resetState();
        courtRecord = makeCourtRecord(
          courtId,
          { monday: { open: "08:00", close: "20:00" } },
          "unavailable"
        );

        const req = buildSlotsRequest({ courtId, date });
        const res = await GET(req);

        expect(res.status).toBe(404);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 7.2**
   *
   * Unavailable date returns 422.
   */
  it("returns 422 when the date is in court_unavailable_dates", async () => {
    await fc.assert(
      fc.asyncProperty(uuidArb, async (courtId) => {
        const date = KNOWN_MONDAY;

        resetState();
        courtRecord = makeCourtRecord(courtId, {
          monday: { open: "08:00", close: "20:00" },
        });

        // Mark the date as unavailable
        unavailableDates.add(date);

        const req = buildSlotsRequest({ courtId, date });
        const res = await GET(req);

        expect(res.status).toBe(422);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 7.2**
   *
   * Missing query params return 400.
   */
  it("returns 400 when courtId or date is missing", async () => {
    // Missing courtId
    const missingCourtId = buildSlotsRequest({ date: "2024-01-01" });
    const res1 = await GET(missingCourtId);
    expect(res1.status).toBe(400);
    const body1 = await res1.json();
    expect(body1.error).toMatch(/courtId/i);

    // Missing date
    const missingDate = buildSlotsRequest({
      courtId: "550e8400-e29b-41d4-a716-446655440000",
    });
    const res2 = await GET(missingDate);
    expect(res2.status).toBe(400);
    const body2 = await res2.json();
    expect(body2.error).toMatch(/date/i);
  });
});
