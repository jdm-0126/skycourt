/**
 * Property-based tests: Member Booking Dashboard Accuracy & Cancellation
 *
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
 *
 * Property 13: Member Booking Dashboard Accuracy
 *   For any authenticated member with a known set of bookings, the member
 *   dashboard (GET /api/bookings) must display all upcoming bookings in the
 *   upcoming section and all past bookings in the past section, with no
 *   omissions and no bookings belonging to other members.
 *
 * Property 14: Cancellation Updates Status and Releases Slot
 *   For any booking with status `pending` or `confirmed`, after a cancellation
 *   (DELETE /api/bookings/:id), the booking's status must be `cancelled` and
 *   the booking must appear in the past section (not upcoming).
 *
 * Strategy:
 *   - In-memory Map (bookingId → BookingRow) shared by both mocks.
 *   - Mock `@/lib/supabase/server` (createClient):
 *       · auth.getUser → fixed member user
 *       · from('bookings').select().eq().order() → reads the map, filtered by member_id
 *   - Mock `@/lib/supabase/admin` (createAdminClient):
 *       · from('bookings').select().eq().maybeSingle() → fetch single booking
 *       · from('bookings').update().eq() → mutate status in the map
 *       · from('audit_logs').insert() → no-op capture
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import type { Database } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"] & {
  courts?: { name: string } | null;
};

// ---------------------------------------------------------------------------
// In-memory store (shared by both mocks via module-level variable)
// ---------------------------------------------------------------------------

/** bookingId → BookingRow */
let bookingStore: Map<string, BookingRow>;
/** The member whose session is simulated */
let currentMemberId: string;
/** The member whose app_metadata.role is set (used for DELETE auth) */
let currentUserRole: string;

function resetStore(memberId: string) {
  bookingStore = new Map();
  currentMemberId = memberId;
  currentUserRole = "member";
}

function seedBookings(rows: BookingRow[]) {
  for (const row of rows) {
    bookingStore.set(row.id, row);
  }
}

// ---------------------------------------------------------------------------
// Mock @/lib/supabase/server
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/server", () => {
  return {
    createClient: vi.fn(async () => {
      return {
        auth: {
          getUser: vi.fn(async () => ({
            data: {
              user: {
                id: currentMemberId,
                app_metadata: { role: currentUserRole },
                user_metadata: {},
              },
            },
            error: null,
          })),
        },
        from: vi.fn((table: string) => {
          if (table !== "bookings") {
            throw new Error(`Unexpected table in server mock: ${table}`);
          }

          // Build a chainable query builder that filters by member_id and
          // returns rows with courts joined.
          // The route handler calls: .select(...).eq(...).order(...).order(...)
          // We capture the member_id at the .eq() step and return the rows
          // when the second .order() resolves (as a Promise).
          let filteredRows: BookingRow[] = [];

          function makeOrderChain(): Record<string, unknown> {
            return {
              order: vi.fn(() => makeOrderChain()),
              // Supabase query chains resolve via the PromiseLike interface.
              // We implement `then` as a proper PromiseLike so `await chain` works.
              then: (
                resolve: (v: { data: BookingRow[]; error: null }) => unknown,
                _reject?: (r: unknown) => unknown
              ) => Promise.resolve({ data: filteredRows, error: null }).then(resolve),
            };
          }

          return {
            select: vi.fn((_cols: string) => ({
              eq: vi.fn((_col: string, value: string) => {
                // Filter by member_id
                filteredRows = Array.from(bookingStore.values()).filter(
                  (b) => b.member_id === value
                );
                return makeOrderChain();
              }),
            })),
          };
        }),
      };
    }),
  };
});

// ---------------------------------------------------------------------------
// Mock @/lib/supabase/admin
// ---------------------------------------------------------------------------

type AuditInsert = {
  user_id?: string | null;
  action_type: string;
  affected_record_id?: string | null;
  metadata?: unknown;
};

let capturedAuditLogs: AuditInsert[] = [];

vi.mock("@/lib/supabase/admin", () => {
  return {
    createAdminClient: vi.fn(() => {
      return {
        from: vi.fn((table: string) => {
          if (table === "bookings") {
            return {
              // For fetching a single booking: .select('*').eq('id', id).maybeSingle()
              select: vi.fn((_cols: string) => ({
                eq: vi.fn((_col: string, id: string) => ({
                  maybeSingle: vi.fn(async () => {
                    const row = bookingStore.get(id) ?? null;
                    return { data: row, error: null };
                  }),
                })),
              })),
              // For updating a booking: .update({...}).eq('id', id)
              update: vi.fn((patch: Partial<BookingRow>) => ({
                eq: vi.fn(async (_col: string, id: string) => {
                  const existing = bookingStore.get(id);
                  if (existing) {
                    bookingStore.set(id, { ...existing, ...patch });
                  }
                  return { data: null, error: null };
                }),
              })),
            };
          }

          if (table === "audit_logs") {
            return {
              insert: vi.fn(async (payload: AuditInsert) => {
                capturedAuditLogs.push(payload);
                return { data: null, error: null };
              }),
            };
          }

          throw new Error(`Unexpected table in admin mock: ${table}`);
        }),
      };
    }),
  };
});

// ---------------------------------------------------------------------------
// Import route handlers AFTER mocks
// ---------------------------------------------------------------------------

import { GET } from "@/app/api/bookings/route";
import { DELETE } from "@/app/api/bookings/[id]/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TODAY = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

/** Format a Date to "YYYY-MM-DD" */
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Build a minimal GET request for the bookings endpoint */
function buildGetRequest(): Request {
  return new Request("http://localhost/api/bookings", { method: "GET" });
}

/** Build a minimal DELETE request for a booking */
function buildDeleteRequest(bookingId: string): Request {
  return new Request(`http://localhost/api/bookings/${bookingId}`, {
    method: "DELETE",
  });
}

/** Build the route params for the DELETE handler */
function buildDeleteParams(
  id: string
): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Random UUID-like ID */
const uuidArbitrary = fc.uuid();

/** Booking status for cancellable bookings */
const cancellableStatusArbitrary = fc.constantFrom(
  "pending" as const,
  "confirmed" as const
);

/** All possible booking statuses */
const bookingStatusArbitrary = fc.constantFrom(
  "pending" as const,
  "confirmed" as const,
  "cancelled" as const,
  "rescheduled" as const,
);

/**
 * Date arbitrary: within the past 30 days to the next 30 days.
 * Returns a "YYYY-MM-DD" string.
 */
const bookingDateArbitrary = fc
  .date({
    min: new Date(Date.now() - 30 * 24 * 3600 * 1000),
    max: new Date(Date.now() + 30 * 24 * 3600 * 1000),
  })
  .map(toDateStr);

/** A future booking date (>= today) */
const futureDateArbitrary = fc
  .date({
    min: new Date(), // today
    max: new Date(Date.now() + 30 * 24 * 3600 * 1000),
  })
  .map(toDateStr);

/** A past booking date (< today) */
const pastDateArbitrary = fc
  .date({
    min: new Date(Date.now() - 30 * 24 * 3600 * 1000),
    max: new Date(Date.now() - 24 * 3600 * 1000), // yesterday
  })
  .map(toDateStr);

/** Build a full booking row for a given member */
function buildBookingArbitrary(memberId: string): fc.Arbitrary<BookingRow> {
  return fc.record({
    id: uuidArbitrary,
    member_id: fc.constant(memberId),
    court_id: uuidArbitrary,
    booking_date: bookingDateArbitrary,
    start_time: fc.constantFrom("08:00", "09:00", "10:00", "11:00", "14:00"),
    end_time: fc.constantFrom("09:00", "10:00", "11:00", "12:00", "15:00"),
    status: bookingStatusArbitrary,
    created_at: fc.constant(new Date().toISOString()),
    updated_at: fc.constant(new Date().toISOString()),
    courts: fc.constant({ name: "Court A" }),
  });
}

/** Build a booking with a specific status and date constraint */
function buildCancellableBookingArbitrary(
  memberId: string,
  dateArbitrary: fc.Arbitrary<string>
): fc.Arbitrary<BookingRow> {
  return fc.record({
    id: uuidArbitrary,
    member_id: fc.constant(memberId),
    court_id: uuidArbitrary,
    booking_date: dateArbitrary,
    start_time: fc.constant("09:00"),
    end_time: fc.constant("10:00"),
    status: cancellableStatusArbitrary,
    created_at: fc.constant(new Date().toISOString()),
    updated_at: fc.constant(new Date().toISOString()),
    courts: fc.constant({ name: "Court A" }),
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  capturedAuditLogs = [];
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Property 13: Member Booking Dashboard Accuracy
// ---------------------------------------------------------------------------

describe("Property 13: Member Booking Dashboard Accuracy", () => {
  /**
   * **Validates: Requirements 8.1, 8.2**
   *
   * Sub-property A: All member-owned bookings appear in the response (no omissions).
   * Sub-property B: No other members' bookings appear in the response.
   */
  it("returns all own bookings and no other members' bookings for any set of bookings", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArbitrary, // memberId
        uuidArbitrary, // otherMemberId
        fc.array(fc.uuid(), { minLength: 0, maxLength: 10 }), // own booking ids (distinct)
        fc.array(fc.uuid(), { minLength: 0, maxLength: 5 }), // other member booking ids
        async (memberId, otherMemberId, ownIds, otherIds) => {
          // Ensure memberIds are distinct to avoid cross-contamination
          fc.pre(memberId !== otherMemberId);
          // Ensure no id overlap between own and other
          const allIds = [...ownIds, ...otherIds];
          fc.pre(new Set(allIds).size === allIds.length);

          resetStore(memberId);

          const now = new Date();
          const futureDate = toDateStr(
            new Date(now.getTime() + 2 * 24 * 3600 * 1000)
          );
          const pastDate = toDateStr(
            new Date(now.getTime() - 2 * 24 * 3600 * 1000)
          );

          // Seed own bookings (mix of future/past and various statuses)
          const ownBookings: BookingRow[] = ownIds.map((id, i) => ({
            id,
            member_id: memberId,
            court_id: "court-1",
            booking_date: i % 2 === 0 ? futureDate : pastDate,
            start_time: "09:00",
            end_time: "10:00",
            status: i % 3 === 0 ? "cancelled" : i % 3 === 1 ? "pending" : "confirmed",
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
            courts: { name: "Court A" },
          }));

          // Seed other member's bookings
          const otherBookings: BookingRow[] = otherIds.map((id) => ({
            id,
            member_id: otherMemberId,
            court_id: "court-1",
            booking_date: futureDate,
            start_time: "10:00",
            end_time: "11:00",
            status: "confirmed",
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
            courts: { name: "Court A" },
          }));

          seedBookings([...ownBookings, ...otherBookings]);

          const req = buildGetRequest();
          const res = await GET(req as never);

          expect(res.status).toBe(200);
          const body = await res.json();

          const allReturned: BookingRow[] = [
            ...body.upcoming,
            ...body.past,
          ];

          const returnedIds = allReturned.map((b: BookingRow) => b.id);

          // Sub-property B: no other-member bookings appear
          for (const otherId of otherIds) {
            expect(returnedIds).not.toContain(otherId);
          }

          // Sub-property A: all own bookings appear
          for (const ownId of ownIds) {
            expect(returnedIds).toContain(ownId);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 8.1, 8.2**
   *
   * Sub-property C: Upcoming bookings have booking_date >= today and status !== 'cancelled'.
   * Sub-property D: Past bookings have booking_date < today OR status === 'cancelled'.
   */
  it("correctly partitions bookings into upcoming and past sections", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArbitrary,
        fc.array(
          fc.record({
            id: uuidArbitrary,
            booking_date: bookingDateArbitrary,
            status: bookingStatusArbitrary,
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (memberId, bookingSpecs) => {
          resetStore(memberId);

          const now = new Date();
          const rows: BookingRow[] = bookingSpecs.map((spec) => ({
            id: spec.id,
            member_id: memberId,
            court_id: "court-1",
            booking_date: spec.booking_date,
            start_time: "09:00",
            end_time: "10:00",
            status: spec.status,
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
            courts: { name: "Court A" },
          }));

          seedBookings(rows);

          const req = buildGetRequest();
          const res = await GET(req as never);

          expect(res.status).toBe(200);
          const body = await res.json();

          // Sub-property C: every upcoming booking satisfies
          //   booking_date >= TODAY AND status !== 'cancelled'
          for (const b of body.upcoming as BookingRow[]) {
            expect(b.booking_date >= TODAY).toBe(true);
            expect(b.status).not.toBe("cancelled");
          }

          // Sub-property D: every past booking satisfies
          //   booking_date < TODAY OR status === 'cancelled'
          for (const b of body.past as BookingRow[]) {
            const isPastDate = b.booking_date < TODAY;
            const isCancelled = b.status === "cancelled";
            expect(isPastDate || isCancelled).toBe(true);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 8.1, 8.2**
   *
   * Completeness: every booking that should be upcoming IS in upcoming,
   * and every booking that should be past IS in past.
   */
  it("does not omit any booking from either upcoming or past", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArbitrary,
        fc.array(
          fc.record({
            id: uuidArbitrary,
            booking_date: bookingDateArbitrary,
            status: bookingStatusArbitrary,
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (memberId, bookingSpecs) => {
          resetStore(memberId);

          const now = new Date();
          const rows: BookingRow[] = bookingSpecs.map((spec) => ({
            id: spec.id,
            member_id: memberId,
            court_id: "court-1",
            booking_date: spec.booking_date,
            start_time: "09:00",
            end_time: "10:00",
            status: spec.status,
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
            courts: { name: "Court A" },
          }));

          seedBookings(rows);

          const req = buildGetRequest();
          const res = await GET(req as never);
          expect(res.status).toBe(200);
          const body = await res.json();

          const allReturnedIds = new Set([
            ...(body.upcoming as BookingRow[]).map((b) => b.id),
            ...(body.past as BookingRow[]).map((b) => b.id),
          ]);

          // Every seeded booking must appear in exactly one of the two lists
          for (const row of rows) {
            expect(allReturnedIds.has(row.id)).toBe(true);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 14: Cancellation Updates Status and Releases Slot
// ---------------------------------------------------------------------------

describe("Property 14: Cancellation Updates Status and Releases Slot", () => {
  /**
   * **Validates: Requirements 8.4**
   *
   * Sub-property A: After DELETE, the booking's status in the store is 'cancelled'.
   */
  it("sets status to cancelled after DELETE for any pending/confirmed booking", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArbitrary, // memberId
        buildCancellableBookingArbitrary(
          "PLACEHOLDER",
          bookingDateArbitrary
        ),
        async (memberId, booking) => {
          // Override member_id to match current session
          const ownedBooking: BookingRow = { ...booking, member_id: memberId };

          resetStore(memberId);
          seedBookings([ownedBooking]);

          const req = buildDeleteRequest(ownedBooking.id);
          const params = buildDeleteParams(ownedBooking.id);

          const res = await DELETE(req as never, params);
          expect(res.status).toBe(200);

          const body = await res.json();
          expect(body.success).toBe(true);

          // Verify the store was updated
          const updated = bookingStore.get(ownedBooking.id);
          expect(updated).toBeDefined();
          expect(updated!.status).toBe("cancelled");
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 8.4**
   *
   * Sub-property B: After cancellation, the booking appears in the past list
   * (not upcoming) in a subsequent GET — regardless of booking_date.
   */
  it("cancelled booking appears in past (not upcoming) after DELETE for any date", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArbitrary, // memberId
        // Use future dates to make the test meaningful: without cancellation,
        // these bookings would be upcoming.
        buildCancellableBookingArbitrary("PLACEHOLDER", futureDateArbitrary),
        async (memberId, booking) => {
          const ownedBooking: BookingRow = { ...booking, member_id: memberId };

          resetStore(memberId);
          seedBookings([ownedBooking]);

          // Verify the booking is initially upcoming (pre-condition)
          const getReqBefore = buildGetRequest();
          const resBefore = await GET(getReqBefore as never);
          expect(resBefore.status).toBe(200);
          const bodyBefore = await resBefore.json();
          const upcomingIdsBefore = (bodyBefore.upcoming as BookingRow[]).map(
            (b) => b.id
          );
          expect(upcomingIdsBefore).toContain(ownedBooking.id);

          // Cancel the booking
          const delReq = buildDeleteRequest(ownedBooking.id);
          const delParams = buildDeleteParams(ownedBooking.id);
          const delRes = await DELETE(delReq as never, delParams);
          expect(delRes.status).toBe(200);

          // Verify the booking now appears only in past
          const getReqAfter = buildGetRequest();
          const resAfter = await GET(getReqAfter as never);
          expect(resAfter.status).toBe(200);
          const bodyAfter = await resAfter.json();

          const upcomingIdsAfter = (bodyAfter.upcoming as BookingRow[]).map(
            (b) => b.id
          );
          const pastIdsAfter = (bodyAfter.past as BookingRow[]).map(
            (b) => b.id
          );

          // Must NOT be in upcoming
          expect(upcomingIdsAfter).not.toContain(ownedBooking.id);
          // Must be in past
          expect(pastIdsAfter).toContain(ownedBooking.id);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 8.4**
   *
   * Double-cancel guard: attempting to cancel an already-cancelled booking
   * must return 409 Conflict.
   */
  it("returns 409 when cancelling an already-cancelled booking", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArbitrary,
        uuidArbitrary,
        async (memberId, bookingId) => {
          const now = new Date();
          const cancelledBooking: BookingRow = {
            id: bookingId,
            member_id: memberId,
            court_id: "court-1",
            booking_date: toDateStr(
              new Date(now.getTime() + 2 * 24 * 3600 * 1000)
            ),
            start_time: "09:00",
            end_time: "10:00",
            status: "cancelled",
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
            courts: { name: "Court A" },
          };

          resetStore(memberId);
          seedBookings([cancelledBooking]);

          const req = buildDeleteRequest(bookingId);
          const params = buildDeleteParams(bookingId);
          const res = await DELETE(req as never, params);

          expect(res.status).toBe(409);
          const body = await res.json();
          expect(body.error).toBeDefined();
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * **Validates: Requirements 8.4**
   *
   * Ownership guard: a member cannot cancel another member's booking.
   * DELETE must return 403 Forbidden.
   */
  it("returns 403 when a member tries to cancel another member's booking", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArbitrary, // memberId (authenticated user)
        uuidArbitrary, // otherMemberId (booking owner)
        uuidArbitrary, // bookingId
        async (memberId, otherMemberId, bookingId) => {
          fc.pre(memberId !== otherMemberId);

          const now = new Date();
          const otherBooking: BookingRow = {
            id: bookingId,
            member_id: otherMemberId, // owned by a different member
            court_id: "court-1",
            booking_date: toDateStr(
              new Date(now.getTime() + 2 * 24 * 3600 * 1000)
            ),
            start_time: "09:00",
            end_time: "10:00",
            status: "confirmed",
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
            courts: { name: "Court A" },
          };

          resetStore(memberId); // authenticated as memberId
          seedBookings([otherBooking]);

          const req = buildDeleteRequest(bookingId);
          const params = buildDeleteParams(bookingId);
          const res = await DELETE(req as never, params);

          expect(res.status).toBe(403);
        }
      ),
      { numRuns: 30 }
    );
  });
});
