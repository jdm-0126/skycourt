/**
 * Property-based test: Report Metrics Match Actual Data
 *
 * **Validates: Requirements 16.2**
 *
 * Property 27: Report Metrics Match Actual Data
 *   For any selected time range (daily, weekly, monthly), the metrics
 *   returned by GET /api/reports must exactly match the results of
 *   equivalent aggregate computations over the in-memory store:
 *     - totalBookings         = count of all bookings in [rangeStart, today]
 *     - cancelledCount        = count of bookings with status = 'cancelled'
 *     - bookingsPerCourt      = per-court booking counts, sorted desc by count
 *     - peakHours             = per-hour booking counts, sorted asc by hour
 *     - newMemberRegistrations = count of member users with created_at >= rangeStart
 *
 * Strategy:
 *   - Mock `@/lib/supabase/server` (createClient) with an admin auth user.
 *   - Mock `@/lib/supabase/admin` (createAdminClient) with a chainable query
 *     builder backed by two in-memory arrays: bookingsStore and usersStore.
 *   - The mock applies .gte / .lte / .eq filter predicates and resolves
 *     { data, error } when awaited.
 *   - For each of the three ranges, generate random bookings and users,
 *     hand-compute the expected metrics, call the route, then assert the
 *     response is identical.
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BookingStatus = "pending" | "confirmed" | "cancelled" | "rescheduled";

type BookingRecord = {
  id: string;
  court_id: string;
  start_time: string; // "HH:MM:SS"
  status: BookingStatus;
  booking_date: string; // "YYYY-MM-DD"
  courts: { name: string } | null;
};

type UserRecord = {
  id: string;
  role: "member" | "admin" | "super_admin";
  created_at: string; // ISO timestamp "YYYY-MM-DDT..."
};

// ---------------------------------------------------------------------------
// In-memory stores — reset before each property run
// ---------------------------------------------------------------------------

let bookingsStore: BookingRecord[];
let usersStore: UserRecord[];

function resetStores(bookings: BookingRecord[], users: UserRecord[]) {
  bookingsStore = bookings;
  usersStore = users;
}

// ---------------------------------------------------------------------------
// Mock @/lib/supabase/server
//
// The route handler calls `createClient()` only to authenticate the user.
// We return an admin user unconditionally.
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: {
            id: "admin-user-id",
            app_metadata: { role: "admin" },
            user_metadata: {},
          },
        },
        error: null,
      })),
    },
  })),
}));

// ---------------------------------------------------------------------------
// Mock @/lib/supabase/admin
//
// The route handler issues two queries via createAdminClient():
//
//   1. adminClient.from("bookings")
//        .select("id, court_id, start_time, status, courts(name)")
//        .gte("booking_date", rangeStart)
//        .lte("booking_date", today)
//
//   2. adminClient.from("users")
//        .select("id")
//        .eq("role", "member")
//        .gte("created_at", `${rangeStart}T00:00:00.000Z`)
//
// We build a generic chainable builder that accumulates string predicates
// and resolves { data, error } when awaited.
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => {
    return {
      from: vi.fn((table: string) => {
        if (table !== "bookings" && table !== "users") {
          throw new Error(`Unexpected table in admin mock: ${table}`);
        }

        const predicates: Array<
          (row: BookingRecord | UserRecord) => boolean
        > = [];

        function getRows(): Array<BookingRecord | UserRecord> {
          return table === "bookings" ? bookingsStore : usersStore;
        }

        // The thenable resolves with the filtered rows
        const thenable = {
          then(
            resolve: (v: {
              data: Array<BookingRecord | UserRecord>;
              error: null;
            }) => void,
            _reject?: (reason: unknown) => void
          ) {
            const results = getRows().filter((row) =>
              predicates.every((p) => p(row))
            );
            resolve({ data: results, error: null });
          },
        };

        const builder: Record<string, unknown> = {
          select: vi.fn(() => builder),

          // .gte(col, value) — col >= value (string comparison on ISO dates)
          gte: vi.fn((col: string, value: string) => {
            predicates.push(
              (row) =>
                ((row as Record<string, unknown>)[col] as string) >= value
            );
            return builder;
          }),

          // .lte(col, value) — col <= value
          lte: vi.fn((col: string, value: string) => {
            predicates.push(
              (row) =>
                ((row as Record<string, unknown>)[col] as string) <= value
            );
            return builder;
          }),

          // .eq(col, value) — exact equality
          eq: vi.fn((col: string, value: string) => {
            predicates.push(
              (row) =>
                ((row as Record<string, unknown>)[col] as string) === value
            );
            return builder;
          }),

          then: thenable.then.bind(thenable),
        };

        return builder;
      }),
    };
  }),
}));

// ---------------------------------------------------------------------------
// Import the route handler AFTER mocks are set up
// ---------------------------------------------------------------------------

import { GET } from "@/app/api/reports/route";

// ---------------------------------------------------------------------------
// Date helpers (mirrors the route implementation exactly)
// ---------------------------------------------------------------------------

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function getRangeStart(range: "daily" | "weekly" | "monthly"): string {
  const now = new Date();
  if (range === "daily") {
    return now.toISOString().slice(0, 10);
  }
  if (range === "weekly") {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  }
  const d = new Date(now);
  d.setDate(d.getDate() - 29);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Reference implementations — hand-compute expected metrics
// ---------------------------------------------------------------------------

interface BookingPerCourt {
  courtName: string;
  count: number;
}

interface PeakHour {
  hour: number;
  count: number;
}

function filterBookingsByRange(
  bookings: BookingRecord[],
  range: "daily" | "weekly" | "monthly"
): BookingRecord[] {
  const start = getRangeStart(range);
  const end = getToday();
  return bookings.filter(
    (b) => b.booking_date >= start && b.booking_date <= end
  );
}

function expectedTotalBookings(bookings: BookingRecord[]): number {
  return bookings.length;
}

function expectedCancelledCount(bookings: BookingRecord[]): number {
  return bookings.filter((b) => b.status === "cancelled").length;
}

function expectedBookingsPerCourt(bookings: BookingRecord[]): BookingPerCourt[] {
  const map = new Map<string, number>();
  for (const b of bookings) {
    const name = b.courts?.name ?? "Unknown Court";
    map.set(name, (map.get(name) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([courtName, count]) => ({ courtName, count }))
    .sort((a, b) => b.count - a.count);
}

function expectedPeakHours(bookings: BookingRecord[]): PeakHour[] {
  const map = new Map<number, number>();
  for (const b of bookings) {
    if (b.start_time) {
      const hour = parseInt(b.start_time.slice(0, 2), 10);
      if (!isNaN(hour)) {
        map.set(hour, (map.get(hour) ?? 0) + 1);
      }
    }
  }
  return Array.from(map.entries())
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour - b.hour);
}

function expectedNewMemberRegistrations(
  users: UserRecord[],
  range: "daily" | "weekly" | "monthly"
): number {
  const start = `${getRangeStart(range)}T00:00:00.000Z`;
  return users.filter((u) => u.role === "member" && u.created_at >= start)
    .length;
}

// ---------------------------------------------------------------------------
// Request builder
// ---------------------------------------------------------------------------

function buildRequest(range: string): NextRequest {
  const url = new URL(`http://localhost/api/reports?range=${range}`);
  return new NextRequest(url.toString(), { method: "GET" });
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

type Range = "daily" | "weekly" | "monthly";
const RANGES: Range[] = ["daily", "weekly", "monthly"];

const BOOKING_STATUSES: BookingStatus[] = [
  "pending",
  "confirmed",
  "cancelled",
  "rescheduled",
];

const COURT_NAMES = ["Court 1", "Court 2", "Court 3", "Court 4"] as const;
const START_TIMES = [
  "08:00:00",
  "09:00:00",
  "10:00:00",
  "11:00:00",
  "12:00:00",
  "13:00:00",
  "14:00:00",
  "15:00:00",
  "16:00:00",
  "17:00:00",
] as const;

/** Generate dates within the monthly window (last 29 days + today + 2 future days) */
function buildDateArb(): fc.Arbitrary<string> {
  const dates: string[] = [];
  const now = new Date();
  for (let offset = -29; offset <= 2; offset++) {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    dates.push(d.toISOString().slice(0, 10));
  }
  return fc.constantFrom(...(dates as [string, ...string[]]));
}

const dateArb = buildDateArb();

const bookingArb: fc.Arbitrary<BookingRecord> = fc.record({
  id: fc.uuid(),
  court_id: fc.uuid(),
  start_time: fc.constantFrom(...START_TIMES),
  status: fc.constantFrom(...BOOKING_STATUSES),
  booking_date: dateArb,
  courts: fc.oneof(
    fc.constant(null),
    fc.record({ name: fc.constantFrom(...COURT_NAMES) })
  ),
});

const userArb: fc.Arbitrary<UserRecord> = fc.record({
  id: fc.uuid(),
  role: fc.constantFrom("member" as const, "admin" as const, "super_admin" as const),
  created_at: dateArb.map((d) => `${d}T00:00:00.000Z`),
});

const bookingsArb = fc.array(bookingArb, { minLength: 0, maxLength: 20 });
const usersArb = fc.array(userArb, { minLength: 0, maxLength: 20 });

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Property 27: Report Metrics Match Actual Data
// ---------------------------------------------------------------------------

describe("Property 27: Report Metrics Match Actual Data", () => {
  /**
   * **Validates: Requirements 16.2**
   *
   * Core property: for any combination of bookings, users, and time range,
   * ALL five metrics returned by the route match the hand-computed reference
   * values simultaneously.
   */
  it("all metrics match the hand-computed values for any data set and range", async () => {
    await fc.assert(
      fc.asyncProperty(
        bookingsArb,
        usersArb,
        fc.constantFrom(...RANGES),
        async (bookings, users, range) => {
          resetStores(bookings, users);

          const req = buildRequest(range);
          const res = await GET(req as never);

          expect(res.status).toBe(200);

          const body = await res.json();

          const inRange = filterBookingsByRange(bookings, range);

          expect(body.range).toBe(range);
          expect(body.totalBookings).toBe(expectedTotalBookings(inRange));
          expect(body.cancelledCount).toBe(expectedCancelledCount(inRange));
          expect(body.bookingsPerCourt).toEqual(
            expectedBookingsPerCourt(inRange)
          );
          expect(body.peakHours).toEqual(expectedPeakHours(inRange));
          expect(body.newMemberRegistrations).toBe(
            expectedNewMemberRegistrations(users, range)
          );
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 16.2**
   *
   * totalBookings: the count equals the number of bookings whose
   * booking_date falls within [rangeStart, today]. No status filtering.
   */
  it("totalBookings counts all bookings in the date range regardless of status", async () => {
    await fc.assert(
      fc.asyncProperty(
        bookingsArb,
        fc.constantFrom(...RANGES),
        async (bookings, range) => {
          resetStores(bookings, []);

          const req = buildRequest(range);
          const res = await GET(req as never);
          expect(res.status).toBe(200);

          const body = await res.json();
          const inRange = filterBookingsByRange(bookings, range);

          expect(body.totalBookings).toBe(inRange.length);
        }
      ),
      { numRuns: 150 }
    );
  });

  /**
   * **Validates: Requirements 16.2**
   *
   * cancelledCount: only bookings with status = 'cancelled' within the
   * range are counted. All other statuses are excluded.
   */
  it("cancelledCount counts only cancelled bookings in the date range", async () => {
    await fc.assert(
      fc.asyncProperty(
        bookingsArb,
        fc.constantFrom(...RANGES),
        async (bookings, range) => {
          resetStores(bookings, []);

          const req = buildRequest(range);
          const res = await GET(req as never);
          expect(res.status).toBe(200);

          const body = await res.json();
          const inRange = filterBookingsByRange(bookings, range);
          const expected = inRange.filter((b) => b.status === "cancelled").length;

          expect(body.cancelledCount).toBe(expected);
        }
      ),
      { numRuns: 150 }
    );
  });

  /**
   * **Validates: Requirements 16.2**
   *
   * bookingsPerCourt: each entry represents exactly the bookings for that
   * court within the range. The list is sorted descending by count.
   */
  it("bookingsPerCourt entries match per-court counts and are sorted desc by count", async () => {
    await fc.assert(
      fc.asyncProperty(
        bookingsArb,
        fc.constantFrom(...RANGES),
        async (bookings, range) => {
          resetStores(bookings, []);

          const req = buildRequest(range);
          const res = await GET(req as never);
          expect(res.status).toBe(200);

          const body = await res.json();
          const inRange = filterBookingsByRange(bookings, range);
          const expected = expectedBookingsPerCourt(inRange);

          expect(body.bookingsPerCourt).toEqual(expected);

          // Verify descending order
          const counts: number[] = body.bookingsPerCourt.map(
            (e: BookingPerCourt) => e.count
          );
          for (let i = 1; i < counts.length; i++) {
            expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
          }
        }
      ),
      { numRuns: 150 }
    );
  });

  /**
   * **Validates: Requirements 16.2**
   *
   * peakHours: each entry represents the booking count for that hour within
   * the range. The list is sorted ascending by hour number.
   */
  it("peakHours entries match per-hour counts and are sorted asc by hour", async () => {
    await fc.assert(
      fc.asyncProperty(
        bookingsArb,
        fc.constantFrom(...RANGES),
        async (bookings, range) => {
          resetStores(bookings, []);

          const req = buildRequest(range);
          const res = await GET(req as never);
          expect(res.status).toBe(200);

          const body = await res.json();
          const inRange = filterBookingsByRange(bookings, range);
          const expected = expectedPeakHours(inRange);

          expect(body.peakHours).toEqual(expected);

          // Verify ascending order
          const hours: number[] = body.peakHours.map((e: PeakHour) => e.hour);
          for (let i = 1; i < hours.length; i++) {
            expect(hours[i]).toBeGreaterThan(hours[i - 1]);
          }
        }
      ),
      { numRuns: 150 }
    );
  });

  /**
   * **Validates: Requirements 16.2**
   *
   * newMemberRegistrations: counts only users with role = 'member' whose
   * created_at is >= rangeStart. Non-member roles and earlier registrations
   * are excluded.
   */
  it("newMemberRegistrations counts only members registered within the date range", async () => {
    await fc.assert(
      fc.asyncProperty(
        usersArb,
        fc.constantFrom(...RANGES),
        async (users, range) => {
          resetStores([], users);

          const req = buildRequest(range);
          const res = await GET(req as never);
          expect(res.status).toBe(200);

          const body = await res.json();
          const expected = expectedNewMemberRegistrations(users, range);

          expect(body.newMemberRegistrations).toBe(expected);
        }
      ),
      { numRuns: 150 }
    );
  });

  /**
   * **Validates: Requirements 16.2**
   *
   * Empty database: all metrics must be zero / empty arrays when stores
   * contain no records.
   */
  it("returns zero/empty metrics when the database is empty", async () => {
    for (const range of RANGES) {
      resetStores([], []);

      const req = buildRequest(range);
      const res = await GET(req as never);
      expect(res.status).toBe(200);

      const body = await res.json();

      expect(body.totalBookings).toBe(0);
      expect(body.cancelledCount).toBe(0);
      expect(body.bookingsPerCourt).toEqual([]);
      expect(body.peakHours).toEqual([]);
      expect(body.newMemberRegistrations).toBe(0);
    }
  });

  /**
   * **Validates: Requirements 16.2**
   *
   * Range isolation: a booking outside the selected range must not
   * contribute to any metric.
   */
  it("bookings outside the date range do not affect any metric", async () => {
    await fc.assert(
      fc.asyncProperty(
        bookingsArb,
        usersArb,
        fc.constantFrom(...RANGES),
        async (bookings, users, range) => {
          resetStores(bookings, users);

          const req = buildRequest(range);
          const res = await GET(req as never);
          expect(res.status).toBe(200);
          const bodyBefore = await res.json();

          // Add a booking clearly outside any range (far in the past)
          const outsideBooking: BookingRecord = {
            id: "outside-booking-id",
            court_id: "outside-court",
            start_time: "09:00:00",
            status: "confirmed",
            booking_date: "2000-01-01",
            courts: { name: "Old Court" },
          };
          resetStores([...bookings, outsideBooking], users);

          const req2 = buildRequest(range);
          const res2 = await GET(req2 as never);
          expect(res2.status).toBe(200);
          const bodyAfter = await res2.json();

          // None of the metrics should change
          expect(bodyAfter.totalBookings).toBe(bodyBefore.totalBookings);
          expect(bodyAfter.cancelledCount).toBe(bodyBefore.cancelledCount);
          expect(bodyAfter.newMemberRegistrations).toBe(
            bodyBefore.newMemberRegistrations
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 16.2**
   *
   * Monotonicity: adding a booking within the range increases totalBookings
   * by exactly 1. bookingsPerCourt for that court also increases by 1.
   */
  it("adding a booking in range increases totalBookings by 1 and updates bookingsPerCourt", async () => {
    await fc.assert(
      fc.asyncProperty(
        bookingsArb,
        usersArb,
        fc.constantFrom(...RANGES),
        async (bookings, users, range) => {
          resetStores(bookings, users);

          const req = buildRequest(range);
          const res = await GET(req as never);
          expect(res.status).toBe(200);
          const before = await res.json();

          // New booking dated today (guaranteed within all ranges)
          const newBooking: BookingRecord = {
            id: "new-in-range-booking",
            court_id: "new-court-id",
            start_time: "10:00:00",
            status: "confirmed",
            booking_date: getToday(),
            courts: { name: "New Court" },
          };
          resetStores([...bookings, newBooking], users);

          const req2 = buildRequest(range);
          const res2 = await GET(req2 as never);
          expect(res2.status).toBe(200);
          const after = await res2.json();

          expect(after.totalBookings).toBe(before.totalBookings + 1);

          // "New Court" should appear with count 1 (or incremented if already present)
          const courtEntry = after.bookingsPerCourt.find(
            (e: BookingPerCourt) => e.courtName === "New Court"
          );
          expect(courtEntry).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 16.2**
   *
   * Range field echo: the response always echoes back the requested range.
   */
  it("response range field always equals the requested range", async () => {
    await fc.assert(
      fc.asyncProperty(
        bookingsArb,
        usersArb,
        fc.constantFrom(...RANGES),
        async (bookings, users, range) => {
          resetStores(bookings, users);

          const req = buildRequest(range);
          const res = await GET(req as never);
          expect(res.status).toBe(200);

          const body = await res.json();
          expect(body.range).toBe(range);
        }
      ),
      { numRuns: 50 }
    );
  });
});
