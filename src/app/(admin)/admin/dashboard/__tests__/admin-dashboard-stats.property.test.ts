/**
 * Property-based test: Admin Dashboard Stats Match Database State
 *
 * **Validates: Requirements 10.1**
 *
 * Property 16: Admin Dashboard Stats Match Database State
 *   For any set of bookings, users, and courts in the database, the stats
 *   returned by `fetchDashboardStats` must exactly match what is present in
 *   the in-memory store:
 *     - todayBookingsCount  = bookings WHERE booking_date = TODAY
 *                                     AND status IN ('pending', 'confirmed')
 *     - activeMembersCount  = users   WHERE role = 'member'
 *                                     AND status = 'active'
 *     - availableCourtsCount = courts WHERE status = 'available'
 *
 * Strategy:
 *   - Mock `@/lib/supabase/server` (createClient) with a chainable query
 *     builder backed by three in-memory Maps (bookings, users, courts).
 *   - The mock supports `.select(cols, opts).eq(col, val).in(col, vals)` for
 *     count-only head queries, returning the computed count.
 *   - Generate arbitrary sets of bookings, users, and courts; hand-compute
 *     the expected counts; call `fetchDashboardStats`; assert they match.
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// In-memory stores — reset before each property run
// ---------------------------------------------------------------------------

type BookingRecord = {
  id: string;
  booking_date: string; // "YYYY-MM-DD"
  status: "pending" | "confirmed" | "cancelled" | "rescheduled";
};

type UserRecord = {
  id: string;
  role: "member" | "admin" | "super_admin";
  status: "active" | "inactive";
};

type CourtRecord = {
  id: string;
  status: "available" | "unavailable" | "maintenance";
};

let bookingsStore: BookingRecord[];
let usersStore: UserRecord[];
let courtsStore: CourtRecord[];

function resetStores(
  bookings: BookingRecord[],
  users: UserRecord[],
  courts: CourtRecord[]
) {
  bookingsStore = bookings;
  usersStore = users;
  courtsStore = courts;
}

// ---------------------------------------------------------------------------
// Mock @/lib/supabase/server
//
// The `fetchDashboardStats` function calls createClient() and then builds
// three separate count queries of the form:
//
//   supabase.from(table).select("id", { count: "exact", head: true })
//     [.eq(col, val)]...
//     [.in(col, vals)]
//
// Each chain must be awaitable and resolve to { count: number }.
//
// We build a generic chainable builder that accumulates predicates and
// resolves the count when awaited.
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    /**
     * Build a count-query chain for the given table.
     *
     * Predicates accumulate across .eq() and .in() calls.
     * When the chain is awaited, it counts matching rows.
     */
    function makeCountChain(table: "bookings" | "users" | "courts") {
      const predicates: Array<(row: BookingRecord | UserRecord | CourtRecord) => boolean> = [];

      function getRows(): Array<BookingRecord | UserRecord | CourtRecord> {
        if (table === "bookings") return bookingsStore;
        if (table === "users") return usersStore;
        return courtsStore;
      }

      function computeCount(): number {
        return getRows().filter((row) => predicates.every((p) => p(row))).length;
      }

      const chain: Record<string, unknown> = {
        // .select("id", { count: "exact", head: true }) — starts the chain
        select: vi.fn((_cols: string, _opts?: unknown) => chain),

        // .eq(col, val) — equality predicate
        eq: vi.fn((col: string, val: string) => {
          predicates.push((row) => (row as Record<string, unknown>)[col] === val);
          return chain;
        }),

        // .in(col, vals) — inclusion predicate
        in: vi.fn((col: string, vals: string[]) => {
          predicates.push((row) =>
            vals.includes((row as Record<string, unknown>)[col] as string)
          );
          return chain;
        }),

        // .limit() — no-op for head queries
        limit: vi.fn(() => chain),

        // Make the chain awaitable: resolves to { count, data: null, error: null }
        then(
          resolve: (v: { count: number; data: null; error: null }) => void,
          _reject?: (reason: unknown) => void
        ) {
          resolve({ count: computeCount(), data: null, error: null });
        },
      };

      return chain;
    }

    return {
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: {
              id: "admin-user-id",
              app_metadata: { role: "admin" },
            },
          },
          error: null,
        })),
      },
      from: vi.fn((table: string) => {
        if (table === "bookings") return makeCountChain("bookings");
        if (table === "users") return makeCountChain("users");
        if (table === "courts") return makeCountChain("courts");
        throw new Error(`Unexpected table in server mock: ${table}`);
      }),
    };
  }),
}));

// ---------------------------------------------------------------------------
// Import `fetchDashboardStats` AFTER mocks are set up
// ---------------------------------------------------------------------------

import { fetchDashboardStats } from "@/app/(admin)/admin/dashboard/stats";

// ---------------------------------------------------------------------------
// Helpers — today's date string (matches what fetchDashboardStats uses)
// ---------------------------------------------------------------------------

/** Returns current date as "YYYY-MM-DD" — must match implementation. */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Returns a date N days from today as "YYYY-MM-DD" */
function offsetDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Reference implementations — hand-computed expected counts
// ---------------------------------------------------------------------------

function expectedTodayBookings(bookings: BookingRecord[]): number {
  const today = todayStr();
  return bookings.filter(
    (b) =>
      b.booking_date === today &&
      (b.status === "pending" || b.status === "confirmed")
  ).length;
}

function expectedActiveMembers(users: UserRecord[]): number {
  return users.filter((u) => u.role === "member" && u.status === "active")
    .length;
}

function expectedAvailableCourts(courts: CourtRecord[]): number {
  return courts.filter((c) => c.status === "available").length;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "cancelled",
  "rescheduled",
] as const;

const USER_ROLES = ["member", "admin", "super_admin"] as const;
const USER_STATUSES = ["active", "inactive"] as const;
const COURT_STATUSES = ["available", "unavailable", "maintenance"] as const;

// Booking dates: today, yesterday, tomorrow, 2 days ago, 2 days ahead
// — constrained so "today" bookings appear with meaningful frequency
const bookingDateArb = fc.oneof(
  fc.constant(todayStr()),
  fc.constant(offsetDate(-1)),
  fc.constant(offsetDate(1)),
  fc.constant(offsetDate(-2)),
  fc.constant(offsetDate(2))
);

const bookingArb: fc.Arbitrary<BookingRecord> = fc.record({
  id: fc.uuid(),
  booking_date: bookingDateArb,
  status: fc.constantFrom(...BOOKING_STATUSES),
});

const userArb: fc.Arbitrary<UserRecord> = fc.record({
  id: fc.uuid(),
  role: fc.constantFrom(...USER_ROLES),
  status: fc.constantFrom(...USER_STATUSES),
});

const courtArb: fc.Arbitrary<CourtRecord> = fc.record({
  id: fc.uuid(),
  status: fc.constantFrom(...COURT_STATUSES),
});

const bookingsArb = fc.array(bookingArb, { minLength: 0, maxLength: 20 });
const usersArb = fc.array(userArb, { minLength: 0, maxLength: 20 });
const courtsArb = fc.array(courtArb, { minLength: 0, maxLength: 10 });

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Property 16: Admin Dashboard Stats Match Database State
// ---------------------------------------------------------------------------

describe("Property 16: Admin Dashboard Stats Match Database State", () => {
  /**
   * **Validates: Requirements 10.1**
   *
   * Core property: for any arbitrary database state, all three stats
   * returned by fetchDashboardStats are exactly correct.
   */
  it("all three stats match the hand-computed counts for any database state", async () => {
    await fc.assert(
      fc.asyncProperty(
        bookingsArb,
        usersArb,
        courtsArb,
        async (bookings, users, courts) => {
          resetStores(bookings, users, courts);

          const stats = await fetchDashboardStats();

          const expTodayBookings = expectedTodayBookings(bookings);
          const expActiveMembers = expectedActiveMembers(users);
          const expAvailableCourts = expectedAvailableCourts(courts);

          expect(stats.todayBookingsCount).toBe(expTodayBookings);
          expect(stats.activeMembersCount).toBe(expActiveMembers);
          expect(stats.availableCourtsCount).toBe(expAvailableCourts);
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 10.1**
   *
   * Today's bookings: only bookings where booking_date = today AND
   * status IN ('pending', 'confirmed') are counted.
   * Past and future bookings, as well as cancelled/rescheduled bookings, are excluded.
   */
  it("todayBookingsCount counts only today's pending/confirmed bookings", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            booking_date: bookingDateArb,
            status: fc.constantFrom(...BOOKING_STATUSES),
          }),
          { minLength: 0, maxLength: 30 }
        ),
        async (bookings) => {
          resetStores(bookings, [], []);

          const stats = await fetchDashboardStats();

          const today = todayStr();
          const manualCount = bookings.filter(
            (b) =>
              b.booking_date === today &&
              (b.status === "pending" || b.status === "confirmed")
          ).length;

          expect(stats.todayBookingsCount).toBe(manualCount);
        }
      ),
      { numRuns: 150 }
    );
  });

  /**
   * **Validates: Requirements 10.1**
   *
   * Active members: only users where role = 'member' AND status = 'active'
   * are counted. Admins and inactive members are excluded.
   */
  it("activeMembersCount counts only users with role=member and status=active", async () => {
    await fc.assert(
      fc.asyncProperty(usersArb, async (users) => {
        resetStores([], users, []);

        const stats = await fetchDashboardStats();

        const manualCount = users.filter(
          (u) => u.role === "member" && u.status === "active"
        ).length;

        expect(stats.activeMembersCount).toBe(manualCount);
      }),
      { numRuns: 150 }
    );
  });

  /**
   * **Validates: Requirements 10.1**
   *
   * Available courts: only courts where status = 'available' are counted.
   * Courts under maintenance or unavailable are excluded.
   */
  it("availableCourtsCount counts only courts with status=available", async () => {
    await fc.assert(
      fc.asyncProperty(courtsArb, async (courts) => {
        resetStores([], [], courts);

        const stats = await fetchDashboardStats();

        const manualCount = courts.filter((c) => c.status === "available")
          .length;

        expect(stats.availableCourtsCount).toBe(manualCount);
      }),
      { numRuns: 150 }
    );
  });

  /**
   * **Validates: Requirements 10.1**
   *
   * Empty database: all stats must be 0 when stores are empty.
   */
  it("returns zeros for all stats when database is empty", async () => {
    resetStores([], [], []);

    const stats = await fetchDashboardStats();

    expect(stats.todayBookingsCount).toBe(0);
    expect(stats.activeMembersCount).toBe(0);
    expect(stats.availableCourtsCount).toBe(0);
  });

  /**
   * **Validates: Requirements 10.1**
   *
   * Independence: each stat is computed independently. Changing bookings
   * does not affect member or court counts, and vice versa.
   */
  it("stats are computed independently — changing one store does not affect others", async () => {
    await fc.assert(
      fc.asyncProperty(
        bookingsArb,
        usersArb,
        courtsArb,
        async (bookings, users, courts) => {
          resetStores(bookings, users, courts);
          const statsBefore = await fetchDashboardStats();

          // Add a booking that does NOT match the count criteria
          // (yesterday, cancelled) — should not change any counts
          const nonMatchingBooking: BookingRecord = {
            id: "non-matching-id",
            booking_date: offsetDate(-1), // yesterday
            status: "cancelled",
          };
          resetStores([...bookings, nonMatchingBooking], users, courts);
          const statsAfter = await fetchDashboardStats();

          // Today bookings count must not change (booking is not for today)
          expect(statsAfter.todayBookingsCount).toBe(
            statsBefore.todayBookingsCount
          );
          // Active members and available courts are completely unaffected
          expect(statsAfter.activeMembersCount).toBe(
            statsBefore.activeMembersCount
          );
          expect(statsAfter.availableCourtsCount).toBe(
            statsBefore.availableCourtsCount
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 10.1**
   *
   * Monotonicity: adding a qualifying record increases the relevant count by
   * exactly 1.
   */
  it("adding a qualifying booking increases todayBookingsCount by exactly 1", async () => {
    await fc.assert(
      fc.asyncProperty(
        bookingsArb,
        usersArb,
        courtsArb,
        fc.constantFrom("pending" as const, "confirmed" as const),
        async (bookings, users, courts, status) => {
          resetStores(bookings, users, courts);
          const before = await fetchDashboardStats();

          const newBooking: BookingRecord = {
            id: "new-qualifying-booking",
            booking_date: todayStr(),
            status,
          };
          resetStores([...bookings, newBooking], users, courts);
          const after = await fetchDashboardStats();

          expect(after.todayBookingsCount).toBe(
            before.todayBookingsCount + 1
          );
          // Other counts unchanged
          expect(after.activeMembersCount).toBe(before.activeMembersCount);
          expect(after.availableCourtsCount).toBe(before.availableCourtsCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 10.1**
   *
   * Monotonicity: adding an active member increases activeMembersCount by
   * exactly 1.
   */
  it("adding an active member increases activeMembersCount by exactly 1", async () => {
    await fc.assert(
      fc.asyncProperty(
        bookingsArb,
        usersArb,
        courtsArb,
        async (bookings, users, courts) => {
          resetStores(bookings, users, courts);
          const before = await fetchDashboardStats();

          const newMember: UserRecord = {
            id: "new-active-member",
            role: "member",
            status: "active",
          };
          resetStores(bookings, [...users, newMember], courts);
          const after = await fetchDashboardStats();

          expect(after.activeMembersCount).toBe(before.activeMembersCount + 1);
          // Other counts unchanged
          expect(after.todayBookingsCount).toBe(before.todayBookingsCount);
          expect(after.availableCourtsCount).toBe(before.availableCourtsCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 10.1**
   *
   * Monotonicity: adding an available court increases availableCourtsCount
   * by exactly 1.
   */
  it("adding an available court increases availableCourtsCount by exactly 1", async () => {
    await fc.assert(
      fc.asyncProperty(
        bookingsArb,
        usersArb,
        courtsArb,
        async (bookings, users, courts) => {
          resetStores(bookings, users, courts);
          const before = await fetchDashboardStats();

          const newCourt: CourtRecord = {
            id: "new-available-court",
            status: "available",
          };
          resetStores(bookings, users, [...courts, newCourt]);
          const after = await fetchDashboardStats();

          expect(after.availableCourtsCount).toBe(
            before.availableCourtsCount + 1
          );
          // Other counts unchanged
          expect(after.todayBookingsCount).toBe(before.todayBookingsCount);
          expect(after.activeMembersCount).toBe(before.activeMembersCount);
        }
      ),
      { numRuns: 100 }
    );
  });
});
