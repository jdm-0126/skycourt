/**
 * Property-based tests: Admin Booking Status Transitions
 *
 * **Validates: Requirements 11.2, 11.4**
 *
 * Property 17: Admin Booking Approval Transition
 *   For any booking with status "pending", after an admin calls PATCH with
 *   action="approve", the returned booking status is always "confirmed" and
 *   never any other value. If the booking is not "pending", the route must
 *   return 409 Conflict (idempotency guard).
 *
 * Property 18: Admin Booking Reschedule Updates Record
 *   For any valid reschedule (new date + time slot), the booking record
 *   reflected in the response has the updated booking_date, start_time, and
 *   end_time. A cancelled booking cannot be rescheduled (409).
 *
 * Strategy:
 *   - Mock `@/lib/supabase/server` so auth.getUser returns an admin user.
 *   - Mock `@/lib/supabase/admin` with an in-memory Map<bookingId, BookingRow>
 *     that supports .select().eq().maybeSingle(), .update().eq().select().single(),
 *     and .insert() (audit log no-op).
 *   - Generate random bookings and verify PATCH behaviour against each property.
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import type { Database } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];
type BookingStatus = BookingRow["status"];

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
// Mock @/lib/supabase/admin — chainable builder over in-memory store
//
// The PATCH handler calls:
//   1. adminClient.from("bookings").select("*").eq("id", id).maybeSingle()
//   2. adminClient.from("bookings").update({...}).eq("id", id).select().single()
//   3. adminClient.from("audit_logs").insert({...})
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          // --- fetch path: .select("*").eq("id", id).maybeSingle() ---
          select: vi.fn((_cols: string) => ({
            eq: vi.fn((_col: string, id: string) => ({
              maybeSingle: vi.fn(async () => {
                const row = store.get(id) ?? null;
                return { data: row, error: null };
              }),
            })),
          })),

          // --- update path: .update({...}).eq("id", id).select().single() ---
          update: vi.fn((patch: Partial<BookingRow>) => ({
            eq: vi.fn((_col: string, id: string) => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => {
                  const existing = store.get(id);
                  if (!existing) {
                    return {
                      data: null,
                      error: { message: "row not found" },
                    };
                  }
                  const updated: BookingRow = { ...existing, ...patch };
                  store.set(id, updated);
                  return { data: updated, error: null };
                }),
              })),
            })),
          })),
        };
      }

      if (table === "audit_logs") {
        return {
          insert: vi.fn(async () => ({ data: null, error: null })),
        };
      }

      throw new Error(`Unexpected table in admin mock: ${table}`);
    }),
  })),
}));

// ---------------------------------------------------------------------------
// Import route handler AFTER mocks are set up
// ---------------------------------------------------------------------------

import { PATCH } from "@/app/api/bookings/[id]/route";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a NextRequest for PATCH /api/bookings/:id with a JSON body */
function buildPatchRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/bookings/test-id", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Build the route params object expected by the PATCH handler */
function buildRouteParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const ALL_STATUSES: BookingStatus[] = [
  "pending",
  "confirmed",
  "cancelled",
  "rescheduled",
];

const NON_PENDING_STATUSES: BookingStatus[] = [
  "confirmed",
  "cancelled",
  "rescheduled",
];

const NON_CANCELLED_STATUSES: BookingStatus[] = [
  "pending",
  "confirmed",
  "rescheduled",
];

const TIME_SLOTS = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
] as const;

const BOOKING_DATES = [
  "2025-01-10",
  "2025-02-14",
  "2025-03-20",
  "2025-04-05",
  "2025-05-15",
  "2025-06-22",
  "2025-07-30",
  "2025-08-12",
  "2025-09-08",
  "2025-10-25",
] as const;

/** Arbitrary that generates a full booking row */
function bookingArbitrary(
  statusArb: fc.Arbitrary<BookingStatus>
): fc.Arbitrary<BookingRow> {
  return fc.record({
    id: fc.uuid(),
    member_id: fc.uuid(),
    court_id: fc.uuid(),
    booking_date: fc.constantFrom(...BOOKING_DATES),
    start_time: fc.constantFrom(...TIME_SLOTS),
    end_time: fc.constantFrom(...TIME_SLOTS),
    status: statusArb,
    created_at: fc.constant("2025-01-01T00:00:00Z"),
    updated_at: fc.constant("2025-01-01T00:00:00Z"),
  });
}

/** Arbitrary for a valid reschedule target: new date and new start/end times */
const rescheduleTargetArbitrary = fc.record({
  bookingDate: fc.constantFrom(...BOOKING_DATES),
  startTime: fc.constantFrom(...TIME_SLOTS),
  endTime: fc.constantFrom(...TIME_SLOTS),
});

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Property 17: Admin Booking Approval Transition
// ---------------------------------------------------------------------------

describe("Property 17: Admin Booking Approval Transition", () => {
  /**
   * **Validates: Requirements 11.2**
   *
   * Core approval property: for any booking with status "pending", after
   * admin approval the returned status is exactly "confirmed" and nothing else.
   */
  it("always sets status to confirmed (and only confirmed) when approving a pending booking", async () => {
    await fc.assert(
      fc.asyncProperty(
        bookingArbitrary(fc.constant("pending" as BookingStatus)),
        async (booking) => {
          resetStore([booking]);

          const req = buildPatchRequest({ action: "approve" });
          const params = buildRouteParams(booking.id);

          const res = await PATCH(req, params);
          expect(res.status).toBe(200);

          const body = await res.json();
          const returned: BookingRow = body.booking;

          // The only acceptable post-approval status is "confirmed"
          expect(returned.status).toBe("confirmed");
          expect(returned.status).not.toBe("pending");
          expect(returned.status).not.toBe("cancelled");
          expect(returned.status).not.toBe("rescheduled");

          // The in-store record also reflects the new status
          const inStore = store.get(booking.id);
          expect(inStore?.status).toBe("confirmed");
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 11.2**
   *
   * Idempotency guard: approving a booking that is NOT "pending" must always
   * return 409 Conflict. The booking record must remain unchanged.
   */
  it("returns 409 and leaves record unchanged when approving a non-pending booking", async () => {
    await fc.assert(
      fc.asyncProperty(
        bookingArbitrary(fc.constantFrom(...NON_PENDING_STATUSES)),
        async (booking) => {
          const originalStatus = booking.status;
          resetStore([booking]);

          const req = buildPatchRequest({ action: "approve" });
          const params = buildRouteParams(booking.id);

          const res = await PATCH(req, params);
          expect(res.status).toBe(409);

          const body = await res.json();
          expect(body.error).toBeDefined();

          // Record must be unchanged
          const inStore = store.get(booking.id);
          expect(inStore?.status).toBe(originalStatus);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 11.2**
   *
   * Approval is deterministic: the same pending booking approved twice in
   * independent calls always yields the same "confirmed" status the first
   * time, and a 409 on the second (state already mutated to "confirmed").
   */
  it("second approval attempt returns 409 after the first succeeds", async () => {
    await fc.assert(
      fc.asyncProperty(
        bookingArbitrary(fc.constant("pending" as BookingStatus)),
        async (booking) => {
          resetStore([booking]);

          // First call — must succeed
          const req1 = buildPatchRequest({ action: "approve" });
          const res1 = await PATCH(req1, buildRouteParams(booking.id));
          expect(res1.status).toBe(200);
          const body1 = await res1.json();
          expect(body1.booking.status).toBe("confirmed");

          // Second call — store now has status=confirmed, must conflict
          const req2 = buildPatchRequest({ action: "approve" });
          const res2 = await PATCH(req2, buildRouteParams(booking.id));
          expect(res2.status).toBe(409);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 18: Admin Booking Reschedule Updates Record
// ---------------------------------------------------------------------------

describe("Property 18: Admin Booking Reschedule Updates Record", () => {
  /**
   * **Validates: Requirements 11.4**
   *
   * Core reschedule property: for any non-cancelled booking and any valid
   * reschedule target, the returned booking reflects the new date and time
   * slot exactly.
   */
  it("always updates booking_date, start_time, and end_time to the requested values", async () => {
    await fc.assert(
      fc.asyncProperty(
        bookingArbitrary(fc.constantFrom(...NON_CANCELLED_STATUSES)),
        rescheduleTargetArbitrary,
        async (booking, target) => {
          resetStore([booking]);

          const req = buildPatchRequest({
            action: "reschedule",
            bookingDate: target.bookingDate,
            startTime: target.startTime,
            endTime: target.endTime,
          });
          const params = buildRouteParams(booking.id);

          const res = await PATCH(req, params);
          expect(res.status).toBe(200);

          const body = await res.json();
          const returned: BookingRow = body.booking;

          // All three fields must reflect the requested values
          expect(returned.booking_date).toBe(target.bookingDate);
          expect(returned.start_time).toBe(target.startTime);
          expect(returned.end_time).toBe(target.endTime);

          // The in-store record also reflects the updates
          const inStore = store.get(booking.id);
          expect(inStore?.booking_date).toBe(target.bookingDate);
          expect(inStore?.start_time).toBe(target.startTime);
          expect(inStore?.end_time).toBe(target.endTime);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 11.4**
   *
   * Reschedule sets status to "confirmed": after a successful reschedule,
   * the booking's status must always be "confirmed" regardless of its
   * original status.
   */
  it("always sets status to confirmed after a successful reschedule", async () => {
    await fc.assert(
      fc.asyncProperty(
        bookingArbitrary(fc.constantFrom(...NON_CANCELLED_STATUSES)),
        rescheduleTargetArbitrary,
        async (booking, target) => {
          resetStore([booking]);

          const req = buildPatchRequest({
            action: "reschedule",
            bookingDate: target.bookingDate,
            startTime: target.startTime,
            endTime: target.endTime,
          });

          const res = await PATCH(req, buildRouteParams(booking.id));
          expect(res.status).toBe(200);

          const body = await res.json();
          expect(body.booking.status).toBe("confirmed");

          const inStore = store.get(booking.id);
          expect(inStore?.status).toBe("confirmed");
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 11.4**
   *
   * Cancelled bookings cannot be rescheduled: PATCH with action="reschedule"
   * on a cancelled booking must return 409 Conflict, and the record must
   * remain unchanged.
   */
  it("returns 409 when attempting to reschedule a cancelled booking", async () => {
    await fc.assert(
      fc.asyncProperty(
        bookingArbitrary(fc.constant("cancelled" as BookingStatus)),
        rescheduleTargetArbitrary,
        async (booking, target) => {
          resetStore([booking]);

          const req = buildPatchRequest({
            action: "reschedule",
            bookingDate: target.bookingDate,
            startTime: target.startTime,
            endTime: target.endTime,
          });

          const res = await PATCH(req, buildRouteParams(booking.id));
          expect(res.status).toBe(409);

          const body = await res.json();
          expect(body.error).toBeDefined();

          // Record must be unchanged
          const inStore = store.get(booking.id);
          expect(inStore?.booking_date).toBe(booking.booking_date);
          expect(inStore?.start_time).toBe(booking.start_time);
          expect(inStore?.end_time).toBe(booking.end_time);
          expect(inStore?.status).toBe("cancelled");
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 11.4**
   *
   * Missing reschedule fields: PATCH with action="reschedule" but without
   * bookingDate, startTime, or endTime must return 400 Bad Request.
   */
  it("returns 400 when reschedule fields are missing", async () => {
    await fc.assert(
      fc.asyncProperty(
        bookingArbitrary(fc.constantFrom(...ALL_STATUSES)),
        // Arbitrarily omit one or more of the three required fields
        fc.record({
          bookingDate: fc.option(fc.constantFrom(...BOOKING_DATES), {
            nil: undefined,
          }),
          startTime: fc.option(fc.constantFrom(...TIME_SLOTS), {
            nil: undefined,
          }),
          endTime: fc.option(fc.constantFrom(...TIME_SLOTS), {
            nil: undefined,
          }),
        }),
        async (booking, partialTarget) => {
          // Only run the property when at least one field is missing
          fc.pre(
            partialTarget.bookingDate === undefined ||
              partialTarget.startTime === undefined ||
              partialTarget.endTime === undefined
          );

          resetStore([booking]);

          const req = buildPatchRequest({
            action: "reschedule",
            ...partialTarget,
          });

          const res = await PATCH(req, buildRouteParams(booking.id));
          expect(res.status).toBe(400);

          const body = await res.json();
          expect(body.error).toBeDefined();
        }
      ),
      { numRuns: 50 }
    );
  });
});
