/**
 * Property-based tests: Booking Creation Invariants
 *
 * **Validates: Requirements 7.3, 7.5, 7.7**
 *
 * Property 11: Confirmed Booking Has Pending Status
 *   For any valid booking confirmation (authenticated member, available court,
 *   available date and slot), the resulting `bookings` record must have
 *   `status = 'pending'` immediately after creation.
 *
 * Property 12: No Double-Booking of the Same Slot
 *   For any two concurrent or sequential attempts to book the same court, date,
 *   and time slot, at most one booking may succeed. The second attempt must be
 *   rejected with a conflict error (409), and the slot must not appear as
 *   available after the first booking is created.
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CourtRow = {
  id: string;
  name: string;
  status: "available" | "unavailable";
  operating_hours: Record<string, { open: string; close: string }> | null;
  created_at: string;
  updated_at: string;
};

type BookingRow = {
  id: string;
  member_id: string;
  court_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: "pending" | "confirmed" | "cancelled" | "rescheduled";
  created_at: string;
  updated_at: string;
};

type AuditInsert = {
  user_id?: string | null;
  action_type: string;
  affected_record_id?: string | null;
  metadata?: unknown;
};

// ---------------------------------------------------------------------------
// Module-level mutable state (shared by mocks via closure)
// ---------------------------------------------------------------------------

/** bookingId → BookingRow */
let bookingStore: Map<string, BookingRow>;
let courtRecord: CourtRow | null;
let unavailableDates: Set<string>;
let capturedAuditLogs: AuditInsert[];
let currentMemberId: string;

function resetState(memberId: string = "test-member-id") {
  bookingStore = new Map();
  courtRecord = null;
  unavailableDates = new Set();
  capturedAuditLogs = [];
  currentMemberId = memberId;
}

// ---------------------------------------------------------------------------
// Mock @/lib/supabase/server
// (used for auth + read queries: courts, court_unavailable_dates, bookings conflict check)
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: {
            id: currentMemberId,
            app_metadata: { role: "member" },
            user_metadata: {},
          },
        },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      // -----------------------------------------------------------------------
      // courts table: .select('*').eq('id', courtId).maybeSingle()
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
      // court_unavailable_dates: .select('id').eq('court_id', ...).eq('unavailable_date', ...).maybeSingle()
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
      // bookings table: conflict check
      //   .select('id').eq('court_id', ...).eq('booking_date', ...).eq('start_time', ...).in('status', [...]).maybeSingle()
      // -----------------------------------------------------------------------
      if (table === "bookings") {
        return {
          select: vi.fn(() => {
            let filtered: BookingRow[] = Array.from(bookingStore.values());

            return {
              eq: vi.fn((_col1: string, courtIdVal: string) => {
                filtered = filtered.filter((b) => b.court_id === courtIdVal);

                return {
                  eq: vi.fn((_col2: string, dateVal: string) => {
                    filtered = filtered.filter(
                      (b) => b.booking_date === dateVal
                    );

                    return {
                      eq: vi.fn((_col3: string, startTimeVal: string) => {
                        filtered = filtered.filter(
                          (b) => b.start_time === startTimeVal
                        );

                        return {
                          in: vi.fn(
                            (_col4: string, statuses: string[]) => {
                              const statusSet = new Set(statuses);
                              const result = filtered.find((b) =>
                                statusSet.has(b.status)
                              );
                              return {
                                maybeSingle: vi.fn(async () => ({
                                  data: result ?? null,
                                  error: null,
                                })),
                              };
                            }
                          ),
                        };
                      }),
                    };
                  }),
                };
              }),
            };
          }),
        };
      }

      throw new Error(`Unexpected table in server mock: ${table}`);
    }),
  })),
}));

// ---------------------------------------------------------------------------
// Mock @/lib/supabase/admin
// (used for insert booking + audit log)
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      // -----------------------------------------------------------------------
      // bookings table: .insert({...}).select().single()
      // -----------------------------------------------------------------------
      if (table === "bookings") {
        return {
          insert: vi.fn((payload: Omit<BookingRow, "id" | "created_at" | "updated_at">) => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                const now = new Date().toISOString();
                const newRow: BookingRow = {
                  id: crypto.randomUUID(),
                  member_id: payload.member_id,
                  court_id: payload.court_id,
                  booking_date: payload.booking_date,
                  start_time: payload.start_time,
                  end_time: payload.end_time,
                  status: "pending",
                  created_at: now,
                  updated_at: now,
                };
                bookingStore.set(newRow.id, newRow);
                return { data: newRow, error: null };
              }),
            })),
          })),
        };
      }

      // -----------------------------------------------------------------------
      // audit_logs table: .insert({...})
      // -----------------------------------------------------------------------
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
  })),
}));

// ---------------------------------------------------------------------------
// Import route handler AFTER mocks
// ---------------------------------------------------------------------------

import { POST } from "@/app/api/bookings/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a POST request for the bookings endpoint */
function buildPostRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Build a minimal available court record */
function makeAvailableCourt(id: string): CourtRow {
  return {
    id,
    name: "Test Court",
    status: "available",
    operating_hours: { monday: { open: "08:00", close: "20:00" } },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/** Compute endTime as startTime + 1 hour */
function addOneHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const uuidArb = fc.uuid();

/** Future date strings "YYYY-MM-DD" — within the next 30 days */
const futureDateArb = fc
  .date({
    min: new Date(),
    max: new Date(Date.now() + 30 * 24 * 3600 * 1000),
  })
  .map((d) => d.toISOString().slice(0, 10));

/** Valid start times (hourly, must allow +1h end time to stay <= 23:00) */
const startTimeArb = fc.constantFrom(
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "14:00",
  "15:00"
);

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetState();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Property 11: Confirmed Booking Has Pending Status
// ---------------------------------------------------------------------------

describe("Property 11: Confirmed Booking Has Pending Status", () => {
  /**
   * **Validates: Requirements 7.3**
   *
   * For any valid input (authenticated member, available court, valid future
   * date, valid time slot), the returned booking must have status = 'pending'.
   */
  it("newly created booking always has status = 'pending' for any valid input", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        futureDateArb,
        startTimeArb,
        async (courtId, bookingDate, startTime) => {
          resetState();
          courtRecord = makeAvailableCourt(courtId);

          const req = buildPostRequest({
            courtId,
            bookingDate,
            startTime,
            endTime: addOneHour(startTime),
          });

          const res = await POST(req as never);
          expect(res.status).toBe(201);

          const body = await res.json();
          expect(body.booking).toBeDefined();
          expect(body.booking.status).toBe("pending");
          expect(body.booking.member_id).toBe(currentMemberId);
          expect(body.booking.court_id).toBe(courtId);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 7.3**
   *
   * After a successful POST, the booking is stored in the bookingStore
   * with status = 'pending'.
   */
  it("booking is inserted into the store with pending status", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        futureDateArb,
        startTimeArb,
        async (courtId, bookingDate, startTime) => {
          resetState();
          courtRecord = makeAvailableCourt(courtId);

          const req = buildPostRequest({
            courtId,
            bookingDate,
            startTime,
            endTime: addOneHour(startTime),
          });

          const res = await POST(req as never);
          expect(res.status).toBe(201);

          const body = await res.json();
          const storedBooking = bookingStore.get(body.booking.id);
          expect(storedBooking).toBeDefined();
          expect(storedBooking!.status).toBe("pending");
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 7.3**
   *
   * An audit log entry with action_type = 'booking_created' is created
   * for every successful booking.
   */
  it("audit log entry is created for every successful booking", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        futureDateArb,
        startTimeArb,
        async (courtId, bookingDate, startTime) => {
          resetState();
          courtRecord = makeAvailableCourt(courtId);

          const req = buildPostRequest({
            courtId,
            bookingDate,
            startTime,
            endTime: addOneHour(startTime),
          });

          const res = await POST(req as never);
          expect(res.status).toBe(201);

          expect(capturedAuditLogs.length).toBe(1);
          expect(capturedAuditLogs[0].action_type).toBe("booking_created");
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 12: No Double-Booking of the Same Slot
// ---------------------------------------------------------------------------

describe("Property 12: No Double-Booking of the Same Slot", () => {
  /**
   * **Validates: Requirements 7.5, 7.7**
   *
   * When a pending booking already exists for the same court+date+slot,
   * a second POST must return 409 with error = 'SLOT_CONFLICT'.
   */
  it("second booking for same court+date+slot returns 409 (existing status=pending)", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        futureDateArb,
        startTimeArb,
        async (courtId, existingBookingId, bookingDate, startTime) => {
          resetState();
          courtRecord = makeAvailableCourt(courtId);

          // Seed an existing pending booking for the exact same slot
          const existingBooking: BookingRow = {
            id: existingBookingId,
            member_id: "other-member-id",
            court_id: courtId,
            booking_date: bookingDate,
            start_time: startTime,
            end_time: addOneHour(startTime),
            status: "pending",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          bookingStore.set(existingBookingId, existingBooking);

          const req = buildPostRequest({
            courtId,
            bookingDate,
            startTime,
            endTime: addOneHour(startTime),
          });

          const res = await POST(req as never);
          expect(res.status).toBe(409);

          const body = await res.json();
          expect(body.error).toBe("SLOT_CONFLICT");
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 7.5, 7.7**
   *
   * A confirmed booking also blocks the slot — second POST returns 409.
   */
  it("confirmed booking also blocks the slot (status=confirmed)", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        futureDateArb,
        startTimeArb,
        async (courtId, existingBookingId, bookingDate, startTime) => {
          resetState();
          courtRecord = makeAvailableCourt(courtId);

          // Seed an existing confirmed booking
          const existingBooking: BookingRow = {
            id: existingBookingId,
            member_id: "other-member-id",
            court_id: courtId,
            booking_date: bookingDate,
            start_time: startTime,
            end_time: addOneHour(startTime),
            status: "confirmed",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          bookingStore.set(existingBookingId, existingBooking);

          const req = buildPostRequest({
            courtId,
            bookingDate,
            startTime,
            endTime: addOneHour(startTime),
          });

          const res = await POST(req as never);
          expect(res.status).toBe(409);

          const body = await res.json();
          expect(body.error).toBe("SLOT_CONFLICT");
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 7.5, 7.7**
   *
   * A cancelled booking does NOT block the slot — new booking should succeed (201).
   */
  it("cancelled booking does not block the slot (status=cancelled)", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        futureDateArb,
        startTimeArb,
        async (courtId, cancelledBookingId, bookingDate, startTime) => {
          resetState();
          courtRecord = makeAvailableCourt(courtId);

          // Seed a cancelled booking for the same slot
          const cancelledBooking: BookingRow = {
            id: cancelledBookingId,
            member_id: "other-member-id",
            court_id: courtId,
            booking_date: bookingDate,
            start_time: startTime,
            end_time: addOneHour(startTime),
            status: "cancelled",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          bookingStore.set(cancelledBookingId, cancelledBooking);

          const req = buildPostRequest({
            courtId,
            bookingDate,
            startTime,
            endTime: addOneHour(startTime),
          });

          const res = await POST(req as never);
          expect(res.status).toBe(201);

          const body = await res.json();
          expect(body.booking.status).toBe("pending");
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 7.5, 7.7**
   *
   * Sequential bookings: first POST succeeds (201), second POST for the
   * exact same slot returns 409.
   */
  it("sequential bookings: first succeeds, second gets 409", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        futureDateArb,
        startTimeArb,
        async (courtId, bookingDate, startTime) => {
          resetState();
          courtRecord = makeAvailableCourt(courtId);

          const body = {
            courtId,
            bookingDate,
            startTime,
            endTime: addOneHour(startTime),
          };

          // First booking — must succeed
          const res1 = await POST(buildPostRequest(body) as never);
          expect(res1.status).toBe(201);

          const body1 = await res1.json();
          expect(body1.booking.status).toBe("pending");
          expect(bookingStore.size).toBe(1);

          // Second booking for the same slot — must conflict
          const res2 = await POST(buildPostRequest(body) as never);
          expect(res2.status).toBe(409);

          const body2 = await res2.json();
          expect(body2.error).toBe("SLOT_CONFLICT");
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * **Validates: Requirements 7.5, 7.7**
   *
   * Different time slots on the same court+date do not conflict.
   * Booking slot2 while slot1 is taken must succeed (201).
   */
  it("different slots on same court+date do not conflict", async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        futureDateArb,
        async (courtId, existingBookingId, bookingDate) => {
          const startTime1 = "09:00";
          const startTime2 = "10:00";

          resetState();
          courtRecord = makeAvailableCourt(courtId);

          // Seed a booking for slot1
          const existingBooking: BookingRow = {
            id: existingBookingId,
            member_id: "other-member-id",
            court_id: courtId,
            booking_date: bookingDate,
            start_time: startTime1,
            end_time: addOneHour(startTime1),
            status: "pending",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          bookingStore.set(existingBookingId, existingBooking);

          // POST a booking for slot2 (different start time)
          const req = buildPostRequest({
            courtId,
            bookingDate,
            startTime: startTime2,
            endTime: addOneHour(startTime2),
          });

          const res = await POST(req as never);
          expect(res.status).toBe(201);

          const body = await res.json();
          expect(body.booking.status).toBe("pending");
          expect(body.booking.start_time).toBe(startTime2);
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ---------------------------------------------------------------------------
// Error case tests (non-property)
// ---------------------------------------------------------------------------

describe("Booking creation error cases", () => {
  it("returns 422 when court status is not available", async () => {
    const courtId = "550e8400-e29b-41d4-a716-446655440000";
    resetState();
    courtRecord = {
      id: courtId,
      name: "Closed Court",
      status: "unavailable",
      operating_hours: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const req = buildPostRequest({
      courtId,
      bookingDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      startTime: "09:00",
      endTime: "10:00",
    });

    const res = await POST(req as never);
    expect(res.status).toBe(422);

    const body = await res.json();
    expect(body.error).toBe("COURT_UNAVAILABLE");
  });

  it("returns 422 when date is in court_unavailable_dates", async () => {
    const courtId = "550e8400-e29b-41d4-a716-446655440001";
    const bookingDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    resetState();
    courtRecord = makeAvailableCourt(courtId);
    unavailableDates.add(bookingDate);

    const req = buildPostRequest({
      courtId,
      bookingDate,
      startTime: "09:00",
      endTime: "10:00",
    });

    const res = await POST(req as never);
    expect(res.status).toBe(422);

    const body = await res.json();
    expect(body.error).toBe("DATE_UNAVAILABLE");
  });

  it("returns 400 on invalid body (missing courtId)", async () => {
    resetState();

    const req = buildPostRequest({});
    const res = await POST(req as never);

    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid body (past booking date)", async () => {
    resetState();
    const courtId = "550e8400-e29b-41d4-a716-446655440002";
    courtRecord = makeAvailableCourt(courtId);

    const req = buildPostRequest({
      courtId,
      bookingDate: "2020-01-01", // past date
      startTime: "09:00",
      endTime: "10:00",
    });

    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });
});
