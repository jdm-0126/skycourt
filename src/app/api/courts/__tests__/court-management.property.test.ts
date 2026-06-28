/**
 * Property-based tests: Court Management Invariants
 *
 * **Validates: Requirements 12.2, 12.3, 12.4, 12.5**
 *
 * Property 20: Court Creation Round-Trip
 *   For any valid court (name, operating hours), POST /api/courts produces a
 *   `courts` record whose name and operating_hours match the submitted values.
 *
 * Property 21: Updated Court Hours Reflected
 *   For any court whose hours are updated via PATCH /api/courts/:id, the
 *   returned court record contains exactly the new hours — not the old ones.
 *
 * Property 22: Unavailable Courts and Dates Block New Bookings
 *   Setting a court status to "unavailable" causes PATCH to persist that
 *   status. Marking a date unavailable via POST /api/courts/:id/unavailable
 *   persists the record. (Booking-level rejection is tested in booking tests.)
 *
 * Strategy:
 *   - Mock `@/lib/supabase/server` (session/auth) and `@/lib/supabase/admin`
 *     (mutations) with in-memory stores backed by Maps.
 *   - Call the actual Next.js route handlers directly (no HTTP server needed).
 *   - Use fast-check to generate arbitrary valid inputs.
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

type DayHours = { open: string; close: string };
type OperatingHours = Record<string, DayHours>;

interface CourtRecord {
  id: string;
  name: string;
  operating_hours: OperatingHours;
  status: "available" | "unavailable";
  created_at: string;
  updated_at: string;
}

interface UnavailableDateRecord {
  id: string;
  court_id: string;
  unavailable_date: string;
  reason: string | null;
}

let courtsStore = new Map<string, CourtRecord>();
let unavailableDatesStore = new Map<string, UnavailableDateRecord>();
let idCounter = 0;

function nextId(): string {
  return `test-id-${++idCounter}`;
}

function resetStore() {
  courtsStore = new Map();
  unavailableDatesStore = new Map();
}

// ---------------------------------------------------------------------------
// Mock @/lib/supabase/server — provides auth (admin user)
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
    // Public GET /api/courts uses the anon client for reads
    from: vi.fn((table: string) => {
      if (table === "courts") {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() =>
              Promise.resolve({ data: Array.from(courtsStore.values()), error: null })
            ),
          })),
        };
      }
      throw new Error(`Unexpected table in server mock: ${table}`);
    }),
  })),
}));

// ---------------------------------------------------------------------------
// Mock @/lib/supabase/admin — handles all write operations
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      // ---- courts table ----
      if (table === "courts") {
        return {
          // GET existence check: .select("id").eq("id", courtId).maybeSingle()
          select: vi.fn((_cols: string) => ({
            eq: vi.fn((col: string, val: string) => ({
              maybeSingle: vi.fn(() => {
                const found = col === "id" ? courtsStore.get(val) : undefined;
                return Promise.resolve({
                  data: found ? { id: found.id } : null,
                  error: null,
                });
              }),
              // Full court select (used in PATCH return)
              single: vi.fn(() => {
                const found = col === "id" ? courtsStore.get(val) : undefined;
                return Promise.resolve({
                  data: found ?? null,
                  error: found ? null : { message: "Not found" },
                });
              }),
            })),
            order: vi.fn((_col: string, _opts: unknown) =>
              Promise.resolve({ data: Array.from(courtsStore.values()), error: null })
            ),
          })),
          // INSERT
          insert: vi.fn((payload: Omit<CourtRecord, "id" | "created_at" | "updated_at">) => ({
            select: vi.fn(() => ({
              single: vi.fn(() => {
                const id = nextId();
                const now = new Date().toISOString();
                const record: CourtRecord = {
                  id,
                  name: payload.name,
                  operating_hours: payload.operating_hours as OperatingHours,
                  status: payload.status ?? "available",
                  created_at: now,
                  updated_at: now,
                };
                courtsStore.set(id, record);
                return Promise.resolve({ data: record, error: null });
              }),
            })),
          })),
          // UPDATE
          update: vi.fn((updates: Partial<CourtRecord>) => ({
            eq: vi.fn((_col: string, courtId: string) => ({
              select: vi.fn(() => ({
                single: vi.fn(() => {
                  const existing = courtsStore.get(courtId);
                  if (!existing) {
                    return Promise.resolve({ data: null, error: { message: "Not found" } });
                  }
                  const updated: CourtRecord = {
                    ...existing,
                    ...(updates.name !== undefined ? { name: updates.name } : {}),
                    ...(updates.operating_hours !== undefined
                      ? { operating_hours: updates.operating_hours as OperatingHours }
                      : {}),
                    ...(updates.status !== undefined ? { status: updates.status } : {}),
                    updated_at: updates.updated_at ?? new Date().toISOString(),
                  };
                  courtsStore.set(courtId, updated);
                  return Promise.resolve({ data: updated, error: null });
                }),
              })),
            })),
          })),
        };
      }

      // ---- court_unavailable_dates table ----
      if (table === "court_unavailable_dates") {
        return {
          select: vi.fn((_cols: string) => ({
            eq: vi.fn((col1: string, val1: string) => ({
              eq: vi.fn((col2: string, val2: string) => ({
                maybeSingle: vi.fn(() => {
                  // Find by id + court_id
                  const found = Array.from(unavailableDatesStore.values()).find(
                    (r) =>
                      (col1 === "id" ? r.id === val1 : r.court_id === val1) &&
                      (col2 === "court_id" ? r.court_id === val2 : r.id === val2)
                  );
                  return Promise.resolve({ data: found ? { id: found.id } : null, error: null });
                }),
              })),
            })),
          })),
          insert: vi.fn(
            (payload: { court_id: string; unavailable_date: string; reason: string | null }) => ({
              select: vi.fn(() => ({
                single: vi.fn(() => {
                  // Check for duplicate
                  const duplicate = Array.from(unavailableDatesStore.values()).find(
                    (r) =>
                      r.court_id === payload.court_id &&
                      r.unavailable_date === payload.unavailable_date
                  );
                  if (duplicate) {
                    return Promise.resolve({ data: null, error: { code: "23505", message: "Duplicate" } });
                  }
                  const record: UnavailableDateRecord = {
                    id: nextId(),
                    court_id: payload.court_id,
                    unavailable_date: payload.unavailable_date,
                    reason: payload.reason,
                  };
                  unavailableDatesStore.set(record.id, record);
                  return Promise.resolve({ data: record, error: null });
                }),
              })),
            })
          ),
          delete: vi.fn(() => ({
            eq: vi.fn((_col1: string, _val1: string) => ({
              eq: vi.fn((_col2: string, _val2: string) =>
                Promise.resolve({ error: null })
              ),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table in admin mock: ${table}`);
    }),
  })),
}));

// ---------------------------------------------------------------------------
// Import route handlers AFTER mocks
// ---------------------------------------------------------------------------

import { GET as getCourts, POST as postCourt } from "@/app/api/courts/route";
import { PATCH as patchCourt } from "@/app/api/courts/[id]/route";
import { POST as postUnavailable } from "@/app/api/courts/[id]/unavailable/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

/** Build a valid operating_hours object */
function makeHours(open: string, close: string): OperatingHours {
  return Object.fromEntries(DAYS.map((d) => [d, { open, close }]));
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/courts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makePatchRequest(courtId: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/courts/${courtId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeUnavailablePostRequest(courtId: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/courts/${courtId}/unavailable`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Arbitrary valid HH:MM time string */
const timeArb = fc.tuple(
  fc.integer({ min: 6, max: 20 }),
  fc.constantFrom(0, 30)
).map(([h, m]) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);

/** Arbitrary open/close pair where close > open */
const hoursArb = fc.tuple(
  fc.integer({ min: 6, max: 12 }),
  fc.integer({ min: 18, max: 22 })
).map(([openH, closeH]) => ({
  open: `${String(openH).padStart(2, "0")}:00`,
  close: `${String(closeH).padStart(2, "0")}:00`,
}));

/** Arbitrary court name */
const courtNameArb = fc.string({ minLength: 3, maxLength: 30 }).filter(
  (s) => s.trim().length >= 3
);

/** Arbitrary YYYY-MM-DD date string in the future */
const futureDateArb = fc.integer({ min: 1, max: 365 }).map((offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
});

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
});

// ---------------------------------------------------------------------------
// Property 20: Court Creation Round-Trip
// ---------------------------------------------------------------------------

describe("Property 20: Court Creation Round-Trip", () => {
  /**
   * **Validates: Requirements 12.2**
   *
   * For any valid court (name, operating hours), POST /api/courts must
   * return a record whose `name` and `operating_hours` exactly match
   * what was submitted.
   */
  it("created court name and operating_hours match submitted values", async () => {
    await fc.assert(
      fc.asyncProperty(
        courtNameArb,
        hoursArb,
        async (name, { open, close }) => {
          const hours = makeHours(open, close);
          const req = makePostRequest({ name, operatingHours: hours });
          const res = await postCourt(req);
          const body = (await res.json()) as { court: CourtRecord };

          expect(res.status).toBe(201);
          expect(body.court.name).toBe(name);
          // Every day's hours must match
          for (const day of DAYS) {
            expect(body.court.operating_hours[day].open).toBe(open);
            expect(body.court.operating_hours[day].close).toBe(close);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("created court is returned with status=available by default", async () => {
    await fc.assert(
      fc.asyncProperty(courtNameArb, hoursArb, async (name, { open, close }) => {
        const hours = makeHours(open, close);
        const req = makePostRequest({ name, operatingHours: hours });
        const res = await postCourt(req);
        const body = (await res.json()) as { court: CourtRecord };

        expect(res.status).toBe(201);
        expect(body.court.status).toBe("available");
      }),
      { numRuns: 50 }
    );
  });

  it("created court is retrievable via GET /api/courts", async () => {
    await fc.assert(
      fc.asyncProperty(courtNameArb, hoursArb, async (name, { open, close }) => {
        const hours = makeHours(open, close);
        const postReq = makePostRequest({ name, operatingHours: hours });
        const postRes = await postCourt(postReq);
        const { court } = (await postRes.json()) as { court: CourtRecord };

        const getReq = new NextRequest("http://localhost/api/courts");
        const getRes = await getCourts(getReq);
        const { courts } = (await getRes.json()) as { courts: CourtRecord[] };

        const found = courts.find((c) => c.id === court.id);
        expect(found).toBeDefined();
        expect(found!.name).toBe(name);
      }),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 21: Updated Court Hours Reflected
// ---------------------------------------------------------------------------

describe("Property 21: Updated Court Hours Reflected in Booking Flow", () => {
  /**
   * **Validates: Requirements 12.3**
   *
   * After PATCH /api/courts/:id with new operating hours H', the returned
   * court must have operating_hours === H', not the old value.
   */
  it("PATCH updates operating_hours to the new value", async () => {
    await fc.assert(
      fc.asyncProperty(
        courtNameArb,
        hoursArb,
        hoursArb,
        async (name, originalHours, newHours) => {
          // Assume new hours differ from original (filter out identical)
          fc.pre(
            originalHours.open !== newHours.open ||
              originalHours.close !== newHours.close
          );

          // Create the court
          const createReq = makePostRequest({
            name,
            operatingHours: makeHours(originalHours.open, originalHours.close),
          });
          const createRes = await postCourt(createReq);
          expect(createRes.status).toBe(201);
          const { court } = (await createRes.json()) as { court: CourtRecord };

          // Update the hours
          const updatedHours = makeHours(newHours.open, newHours.close);
          const patchReq = makePatchRequest(court.id, { operatingHours: updatedHours });
          const patchRes = await patchCourt(patchReq, {
            params: Promise.resolve({ id: court.id }),
          });
          expect(patchRes.status).toBe(200);
          const { court: updated } = (await patchRes.json()) as { court: CourtRecord };

          // The new hours must be reflected — NOT the old ones
          for (const day of DAYS) {
            expect(updated.operating_hours[day].open).toBe(newHours.open);
            expect(updated.operating_hours[day].close).toBe(newHours.close);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("PATCH preserves name when only operatingHours is updated", async () => {
    await fc.assert(
      fc.asyncProperty(courtNameArb, hoursArb, hoursArb, async (name, orig, updated) => {
        const createReq = makePostRequest({
          name,
          operatingHours: makeHours(orig.open, orig.close),
        });
        const createRes = await postCourt(createReq);
        const { court } = (await createRes.json()) as { court: CourtRecord };

        const patchReq = makePatchRequest(court.id, {
          operatingHours: makeHours(updated.open, updated.close),
        });
        const patchRes = await patchCourt(patchReq, {
          params: Promise.resolve({ id: court.id }),
        });
        const { court: patched } = (await patchRes.json()) as { court: CourtRecord };

        expect(patched.name).toBe(name);
      }),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 22: Unavailable Courts Block New Bookings
// ---------------------------------------------------------------------------

describe("Property 22: Unavailable Courts and Dates", () => {
  /**
   * **Validates: Requirements 12.4**
   *
   * Setting a court status to 'unavailable' via PATCH persists that status.
   * (The booking API checks this status and rejects bookings — tested separately.)
   */
  it("PATCH with status=unavailable sets court status to unavailable", async () => {
    await fc.assert(
      fc.asyncProperty(courtNameArb, hoursArb, async (name, hours) => {
        const createReq = makePostRequest({
          name,
          operatingHours: makeHours(hours.open, hours.close),
        });
        const createRes = await postCourt(createReq);
        const { court } = (await createRes.json()) as { court: CourtRecord };

        // Initially available
        expect(court.status).toBe("available");

        // Mark unavailable
        const patchReq = makePatchRequest(court.id, { status: "unavailable" });
        const patchRes = await patchCourt(patchReq, {
          params: Promise.resolve({ id: court.id }),
        });
        expect(patchRes.status).toBe(200);
        const { court: patched } = (await patchRes.json()) as { court: CourtRecord };

        expect(patched.status).toBe("unavailable");
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 12.5**
   *
   * For any court with a set of unavailable dates D, POST /api/courts/:id/unavailable
   * persists each date exactly once.
   */
  it("POST unavailable date persists the record", async () => {
    await fc.assert(
      fc.asyncProperty(
        courtNameArb,
        hoursArb,
        futureDateArb,
        async (name, hours, unavailableDate) => {
          const createReq = makePostRequest({
            name,
            operatingHours: makeHours(hours.open, hours.close),
          });
          const createRes = await postCourt(createReq);
          const { court } = (await createRes.json()) as { court: CourtRecord };

          const unavailReq = makeUnavailablePostRequest(court.id, { unavailableDate });
          const unavailRes = await postUnavailable(unavailReq, {
            params: Promise.resolve({ id: court.id }),
          });
          expect(unavailRes.status).toBe(201);

          const body = (await unavailRes.json()) as {
            unavailableDate: UnavailableDateRecord;
          };
          expect(body.unavailableDate.court_id).toBe(court.id);
          expect(body.unavailableDate.unavailable_date).toBe(unavailableDate);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("POST unavailable date returns 409 on duplicate", async () => {
    await fc.assert(
      fc.asyncProperty(
        courtNameArb,
        hoursArb,
        futureDateArb,
        async (name, hours, unavailableDate) => {
          const createReq = makePostRequest({
            name,
            operatingHours: makeHours(hours.open, hours.close),
          });
          const createRes = await postCourt(createReq);
          const { court } = (await createRes.json()) as { court: CourtRecord };

          // First insert — should succeed
          const req1 = makeUnavailablePostRequest(court.id, { unavailableDate });
          const res1 = await postUnavailable(req1, {
            params: Promise.resolve({ id: court.id }),
          });
          expect(res1.status).toBe(201);

          // Second insert for same date — should be 409
          const req2 = makeUnavailablePostRequest(court.id, { unavailableDate });
          const res2 = await postUnavailable(req2, {
            params: Promise.resolve({ id: court.id }),
          });
          expect(res2.status).toBe(409);
        }
      ),
      { numRuns: 50 }
    );
  });

  it("multiple distinct unavailable dates can be added to the same court", async () => {
    await fc.assert(
      fc.asyncProperty(
        courtNameArb,
        hoursArb,
        fc.uniqueArray(futureDateArb, { minLength: 2, maxLength: 5 }),
        async (name, hours, dates) => {
          const createReq = makePostRequest({
            name,
            operatingHours: makeHours(hours.open, hours.close),
          });
          const createRes = await postCourt(createReq);
          const { court } = (await createRes.json()) as { court: CourtRecord };

          for (const date of dates) {
            const req = makeUnavailablePostRequest(court.id, { unavailableDate: date });
            const res = await postUnavailable(req, {
              params: Promise.resolve({ id: court.id }),
            });
            expect(res.status).toBe(201);
          }

          // All dates should be in the store
          const stored = Array.from(unavailableDatesStore.values()).filter(
            (r) => r.court_id === court.id
          );
          expect(stored.length).toBe(dates.length);
          for (const date of dates) {
            expect(stored.some((r) => r.unavailable_date === date)).toBe(true);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});
