/**
 * Property-based test: Booking Filter Results Are Correct and Complete
 *
 * **Validates: Requirements 11.5**
 *
 * Property 19: Booking Filter Results Are Correct and Complete
 *   For any combination of filter criteria (dateFrom, dateTo, courtId,
 *   memberName, status), the GET /api/bookings/all route must return exactly
 *   the set of bookings that satisfy every applied filter criterion
 *   simultaneously — no false positives (extra bookings) and no false
 *   negatives (missing bookings).
 *
 * Strategy:
 *   - Mock `@/lib/supabase/server` so auth.getUser returns an admin user.
 *   - Mock `@/lib/supabase/admin` with a chainable query builder backed by
 *     an in-memory Map<bookingId, BookingRow>.
 *   - The mock applies gte/lte/eq filters to simulate server-side DB
 *     filtering; memberName post-filtering is already in the route handler.
 *   - Generate 5–20 bookings with randomised attributes plus a random
 *     subset of filter criteria, then verify the returned set matches the
 *     hand-computed expected set exactly.
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Type representing a booking row as returned by the route handler
// ---------------------------------------------------------------------------

type BookingRow = {
  id: string;
  member_id: string;
  court_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: "pending" | "confirmed" | "cancelled";
  created_at: string;
  updated_at: string;
  courts: { name: string } | null;
  users: { full_name: string; email: string } | null;
};

// ---------------------------------------------------------------------------
// In-memory store — reset before each property run
// ---------------------------------------------------------------------------

let store: Map<string, BookingRow>;

function resetStore(rows: BookingRow[]) {
  store = new Map(rows.map((r) => [r.id, r]));
}

// ---------------------------------------------------------------------------
// Mock @/lib/supabase/server — auth.getUser returns an admin user
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
// Mock @/lib/supabase/admin — chainable query builder over in-memory store
//
// The route handler builds its query like:
//   adminClient.from("bookings")
//     .select("*, courts(name), users(full_name, email)")
//     .order(...)
//     .order(...)
//     [.gte("booking_date", dateFrom)]
//     [.lte("booking_date", dateTo)]
//     [.eq("court_id", courtId)]
//     [.eq("status", status)]
//
// We need a chainable object that accumulates filter predicates and
// executes them against the in-memory store when awaited.
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table !== "bookings") {
        throw new Error(`Unexpected table in admin mock: ${table}`);
      }

      // Accumulated filter predicates
      const predicates: Array<(row: BookingRow) => boolean> = [];

      // The final thenable that executes the query
      const thenable = {
        then(
          resolve: (value: { data: BookingRow[]; error: null }) => void,
          _reject?: (reason: unknown) => void
        ) {
          const results = Array.from(store.values()).filter((row) =>
            predicates.every((p) => p(row))
          );
          resolve({ data: results, error: null });
        },
      };

      // Chainable builder — every method returns itself (the proxy)
      const builder: Record<string, unknown> = {
        select: vi.fn(() => builder),
        order: vi.fn(() => builder),
        gte: vi.fn((_col: string, value: string) => {
          // booking_date >= value
          predicates.push((row) => row.booking_date >= value);
          return builder;
        }),
        lte: vi.fn((_col: string, value: string) => {
          // booking_date <= value
          predicates.push((row) => row.booking_date <= value);
          return builder;
        }),
        eq: vi.fn((col: string, value: string) => {
          predicates.push((row) => {
            if (col === "court_id") return row.court_id === value;
            if (col === "status") return row.status === value;
            return true;
          });
          return builder;
        }),
        // Make the builder thenable so `await builder` resolves correctly
        then: thenable.then.bind(thenable),
      };

      return builder;
    }),
  })),
}));

// ---------------------------------------------------------------------------
// Import route handler AFTER mocks are set up
// ---------------------------------------------------------------------------

import { GET } from "@/app/api/bookings/all/route";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a NextRequest with optional query params. The route handler reads
 *  `request.nextUrl.searchParams`, so we must use NextRequest (not Request). */
function buildGetRequest(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/bookings/all");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url.toString(), { method: "GET" });
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const DATES = [
  "2024-01-01",
  "2024-03-15",
  "2024-06-15",
  "2024-09-01",
  "2024-12-31",
] as const;

const STATUSES = ["pending", "confirmed", "cancelled"] as const;

const COURT_IDS = ["court-A", "court-B", "court-C"] as const;

const MEMBER_NAMES = [
  "Alice Johnson",
  "Bob Smith",
  "Charlie Brown",
  "Diana Prince",
  "Eve Adams",
] as const;

type Status = (typeof STATUSES)[number];

/** Arbitrary for a single booking row */
const bookingArbitrary = fc.record({
  id: fc.uuid(),
  member_id: fc.uuid(),
  court_id: fc.constantFrom(...COURT_IDS),
  booking_date: fc.constantFrom(...DATES),
  start_time: fc.constantFrom("08:00", "10:00", "12:00", "14:00", "16:00"),
  end_time: fc.constantFrom("09:00", "11:00", "13:00", "15:00", "17:00"),
  status: fc.constantFrom(...STATUSES),
  created_at: fc.constant("2024-01-01T00:00:00Z"),
  updated_at: fc.constant("2024-01-01T00:00:00Z"),
  courts: fc.record({ name: fc.constantFrom("Court A", "Court B", "Court C") }),
  users: fc.record({
    full_name: fc.constantFrom(...MEMBER_NAMES),
    email: fc.constantFrom(
      "alice@example.com",
      "bob@example.com",
      "charlie@example.com",
      "diana@example.com",
      "eve@example.com"
    ),
  }),
}) as fc.Arbitrary<BookingRow>;

/** Arbitrary for a list of 5–20 bookings */
const bookingsArbitrary = fc.array(bookingArbitrary, {
  minLength: 5,
  maxLength: 20,
});

/** Arbitrary for an optional filter value — present ~50% of the time */
function optionalFilter<T>(arb: fc.Arbitrary<T>): fc.Arbitrary<T | null> {
  return fc.oneof(fc.constant(null), arb);
}

/** Arbitrary for the filter criteria */
const filtersArbitrary = fc.record({
  dateFrom: optionalFilter(fc.constantFrom(...DATES)),
  dateTo: optionalFilter(fc.constantFrom(...DATES)),
  courtId: optionalFilter(fc.constantFrom(...COURT_IDS)),
  status: optionalFilter(fc.constantFrom(...STATUSES)),
  memberName: optionalFilter(fc.constantFrom("Alice", "Bob", "Charlie", "Diana", "Eve")),
});

// ---------------------------------------------------------------------------
// Reference implementation — compute the expected set in pure JS
// ---------------------------------------------------------------------------

type Filters = {
  dateFrom: string | null;
  dateTo: string | null;
  courtId: string | null;
  status: Status | null;
  memberName: string | null;
};

function applyFilters(bookings: BookingRow[], filters: Filters): BookingRow[] {
  return bookings.filter((b) => {
    if (filters.dateFrom !== null && b.booking_date < filters.dateFrom)
      return false;
    if (filters.dateTo !== null && b.booking_date > filters.dateTo)
      return false;
    if (filters.courtId !== null && b.court_id !== filters.courtId)
      return false;
    if (filters.status !== null && b.status !== filters.status)
      return false;
    if (filters.memberName !== null) {
      const needle = filters.memberName.toLowerCase();
      if (!b.users?.full_name?.toLowerCase().includes(needle)) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Property 19: Booking Filter Results Are Correct and Complete
// ---------------------------------------------------------------------------

describe("Property 19: Booking Filter Results Are Correct and Complete", () => {
  /**
   * **Validates: Requirements 11.5**
   *
   * For any set of bookings and any combination of filter criteria, the
   * response data must contain exactly the bookings that satisfy all
   * applied criteria:
   *   - No false positives: every returned booking satisfies every filter.
   *   - No false negatives: every booking that satisfies every filter is
   *     present in the response.
   */
  it("returns exactly the bookings satisfying all applied filters — no false positives or negatives", async () => {
    await fc.assert(
      fc.asyncProperty(
        bookingsArbitrary,
        filtersArbitrary,
        async (bookings, filters) => {
          // Populate the in-memory store
          resetStore(bookings);

          // Build query params from active filters
          const queryParams: Record<string, string> = {};
          if (filters.dateFrom !== null) queryParams.dateFrom = filters.dateFrom;
          if (filters.dateTo !== null) queryParams.dateTo = filters.dateTo;
          if (filters.courtId !== null) queryParams.courtId = filters.courtId;
          if (filters.status !== null) queryParams.status = filters.status;
          if (filters.memberName !== null)
            queryParams.memberName = filters.memberName;

          // Call the route handler
          const req = buildGetRequest(queryParams);
          const res = await GET(req as never);

          expect(res.status).toBe(200);

          const body = await res.json();
          const returned: BookingRow[] = body.data ?? [];

          // Compute expected set using the reference implementation
          const expected = applyFilters(bookings, filters);

          // Verify count matches
          expect(returned.length).toBe(expected.length);

          // Collect IDs for set-based comparison
          const returnedIds = new Set(returned.map((b) => b.id));
          const expectedIds = new Set(expected.map((b) => b.id));

          // No false positives: every returned ID is in expected
          for (const id of returnedIds) {
            expect(expectedIds.has(id)).toBe(true);
          }

          // No false negatives: every expected ID is in returned
          for (const id of expectedIds) {
            expect(returnedIds.has(id)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 11.5**
   *
   * Soundness: every booking returned satisfies each individual filter
   * criterion that was applied.
   */
  it("all returned bookings individually satisfy each applied filter criterion", async () => {
    await fc.assert(
      fc.asyncProperty(
        bookingsArbitrary,
        filtersArbitrary,
        async (bookings, filters) => {
          resetStore(bookings);

          const queryParams: Record<string, string> = {};
          if (filters.dateFrom !== null) queryParams.dateFrom = filters.dateFrom;
          if (filters.dateTo !== null) queryParams.dateTo = filters.dateTo;
          if (filters.courtId !== null) queryParams.courtId = filters.courtId;
          if (filters.status !== null) queryParams.status = filters.status;
          if (filters.memberName !== null)
            queryParams.memberName = filters.memberName;

          const req = buildGetRequest(queryParams);
          const res = await GET(req as never);
          expect(res.status).toBe(200);

          const body = await res.json();
          const returned: BookingRow[] = body.data ?? [];

          for (const booking of returned) {
            // dateFrom filter: booking_date must be >= dateFrom
            if (filters.dateFrom !== null) {
              expect(booking.booking_date >= filters.dateFrom).toBe(true);
            }
            // dateTo filter: booking_date must be <= dateTo
            if (filters.dateTo !== null) {
              expect(booking.booking_date <= filters.dateTo).toBe(true);
            }
            // courtId filter: court_id must match exactly
            if (filters.courtId !== null) {
              expect(booking.court_id).toBe(filters.courtId);
            }
            // status filter: status must match exactly
            if (filters.status !== null) {
              expect(booking.status).toBe(filters.status);
            }
            // memberName filter: full_name must contain memberName (case-insensitive)
            if (filters.memberName !== null) {
              expect(
                booking.users?.full_name
                  ?.toLowerCase()
                  .includes(filters.memberName.toLowerCase())
              ).toBe(true);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 11.5**
   *
   * Completeness: no booking satisfying all filters is missing from the
   * response.
   */
  it("no booking satisfying all filters is absent from the response", async () => {
    await fc.assert(
      fc.asyncProperty(
        bookingsArbitrary,
        filtersArbitrary,
        async (bookings, filters) => {
          resetStore(bookings);

          const queryParams: Record<string, string> = {};
          if (filters.dateFrom !== null) queryParams.dateFrom = filters.dateFrom;
          if (filters.dateTo !== null) queryParams.dateTo = filters.dateTo;
          if (filters.courtId !== null) queryParams.courtId = filters.courtId;
          if (filters.status !== null) queryParams.status = filters.status;
          if (filters.memberName !== null)
            queryParams.memberName = filters.memberName;

          const req = buildGetRequest(queryParams);
          const res = await GET(req as never);
          expect(res.status).toBe(200);

          const body = await res.json();
          const returned: BookingRow[] = body.data ?? [];
          const returnedIds = new Set(returned.map((b) => b.id));

          // Every booking that satisfies the filters must be in the response
          const expected = applyFilters(bookings, filters);
          for (const b of expected) {
            expect(returnedIds.has(b.id)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 11.5**
   *
   * No-filter baseline: when no filters are applied, all bookings are returned.
   */
  it("returns all bookings when no filters are applied", async () => {
    await fc.assert(
      fc.asyncProperty(bookingsArbitrary, async (bookings) => {
        resetStore(bookings);

        const req = buildGetRequest({});
        const res = await GET(req as never);
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.count).toBe(bookings.length);

        const returnedIds = new Set((body.data as BookingRow[]).map((b) => b.id));
        for (const b of bookings) {
          expect(returnedIds.has(b.id)).toBe(true);
        }
      }),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 11.5**
   *
   * Response count invariant: body.count must equal body.data.length.
   */
  it("response count field always equals the number of items in data array", async () => {
    await fc.assert(
      fc.asyncProperty(
        bookingsArbitrary,
        filtersArbitrary,
        async (bookings, filters) => {
          resetStore(bookings);

          const queryParams: Record<string, string> = {};
          if (filters.dateFrom !== null) queryParams.dateFrom = filters.dateFrom;
          if (filters.dateTo !== null) queryParams.dateTo = filters.dateTo;
          if (filters.courtId !== null) queryParams.courtId = filters.courtId;
          if (filters.status !== null) queryParams.status = filters.status;
          if (filters.memberName !== null)
            queryParams.memberName = filters.memberName;

          const req = buildGetRequest(queryParams);
          const res = await GET(req as never);
          expect(res.status).toBe(200);

          const body = await res.json();
          expect(body.count).toBe((body.data as BookingRow[]).length);
        }
      ),
      { numRuns: 50 }
    );
  });
});
