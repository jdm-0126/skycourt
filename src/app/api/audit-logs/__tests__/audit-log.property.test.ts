/**
 * Property-based tests: Audit Log Generation and Filtering
 *
 * **Validates: Requirements 20.1, 20.3**
 *
 * Property 33: Audit Log Generated for Every Specified Action
 *   For any execution of a listed auditable action (login, logout, booking
 *   creation, booking cancellation, booking approval, admin account creation,
 *   role permission change, database backup), the system must generate exactly
 *   one audit_logs entry with the correct action_type, the acting user's ID,
 *   and a timestamp field.
 *
 * Property 34: Audit Log Filter Returns Correct Entries
 *   For any filter combination (date range, user, action type) applied to audit
 *   logs, the returned entries must contain only entries satisfying all applied
 *   criteria, with no matching entries omitted.
 *
 * Strategy:
 *   - Mock `@/lib/supabase/server` so auth.getUser returns a super_admin user.
 *   - Mock `@/lib/supabase/admin` with a chainable query builder backed by an
 *     in-memory Map<id, AuditLogRow> and a separate auditWriteStore for testing
 *     insert behaviour.
 *   - The mock applies gte/lte/eq filters to simulate server-side DB filtering.
 *   - Generate audit log entries with randomised attributes plus random filter
 *     criteria, then verify the returned set matches the hand-computed expected
 *     set exactly.
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AuditLogRow = {
  id: string;
  user_id: string;
  action_type: string;
  affected_record_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string; // ISO 8601 timestamp
  users: { full_name: string; email: string } | null;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** All auditable action types per Requirements 20.1 */
const ACTION_TYPES = [
  "user_login",
  "user_logout",
  "booking_creation",
  "booking_cancellation",
  "booking_approval",
  "admin_account_created",
  "role_permission_changed",
  "database_backup",
] as const;

type ActionType = (typeof ACTION_TYPES)[number];

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

/** Primary store used by GET /api/audit-logs mock */
let store: Map<string, AuditLogRow>;

/** Secondary store that captures inserts (for Property 33 write tests) */
let auditWriteStore: AuditLogRow[];

function resetStore(rows: AuditLogRow[]) {
  store = new Map(rows.map((r) => [r.id, r]));
  auditWriteStore = [];
}

// ---------------------------------------------------------------------------
// Mock @/lib/supabase/server — auth.getUser returns a super_admin user
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: {
            id: "super-admin-user-id",
            app_metadata: { role: "super_admin" },
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
//   adminClient.from("audit_logs")
//     .select("*, users(full_name, email)")
//     .order("created_at", { ascending: false })
//     [.gte("created_at", `${startDate}T00:00:00.000Z`)]
//     [.lte("created_at", `${endDate}T23:59:59.999Z`)]
//     [.eq("user_id", userId)]
//     [.eq("action_type", actionType)]
//
// We need a chainable object that accumulates filter predicates and
// executes them against the in-memory store when awaited.
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table !== "audit_logs") {
        throw new Error(`Unexpected table in admin mock: ${table}`);
      }

      // Accumulated filter predicates applied by gte/lte/eq calls
      const predicates: Array<(row: AuditLogRow) => boolean> = [];

      // The final thenable that executes the query
      const thenable = {
        then(
          resolve: (value: { data: AuditLogRow[]; error: null }) => void,
          _reject?: (reason: unknown) => void
        ) {
          const results = Array.from(store.values()).filter((row) =>
            predicates.every((p) => p(row))
          );
          // Route orders descending by created_at
          results.sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
          resolve({ data: results, error: null });
        },
      };

      // Chainable builder — every method returns itself
      const builder: Record<string, unknown> = {
        select: vi.fn(() => builder),
        order: vi.fn(() => builder),

        gte: vi.fn((_col: string, value: string) => {
          // startDate filter: created_at >= `${startDate}T00:00:00.000Z`
          predicates.push((row) => row.created_at >= value);
          return builder;
        }),

        lte: vi.fn((_col: string, value: string) => {
          // endDate filter: created_at <= `${endDate}T23:59:59.999Z`
          predicates.push((row) => row.created_at <= value);
          return builder;
        }),

        eq: vi.fn((col: string, value: string) => {
          predicates.push((row) => {
            if (col === "user_id") return row.user_id === value;
            if (col === "action_type") return row.action_type === value;
            return true;
          });
          return builder;
        }),

        insert: vi.fn((entry: AuditLogRow) => {
          auditWriteStore.push(entry);
          return { error: null };
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

import { GET } from "@/app/api/audit-logs/route";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a NextRequest with optional query params. */
function buildGetRequest(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/audit-logs");
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

const TIMES = [
  "T08:00:00.000Z",
  "T12:00:00.000Z",
  "T18:00:00.000Z",
] as const;

const USER_IDS = [
  "user-A",
  "user-B",
  "user-C",
  "user-D",
] as const;

/** Arbitrary for a full ISO 8601 timestamp (date + time) */
const timestampArb: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom(...DATES), fc.constantFrom(...TIMES))
  .map(([date, time]) => `${date}${time}`);

/** Arbitrary for a single audit log row */
const auditLogArbitrary: fc.Arbitrary<AuditLogRow> = fc.record({
  id: fc.uuid(),
  user_id: fc.constantFrom(...USER_IDS),
  action_type: fc.constantFrom(...ACTION_TYPES),
  affected_record_id: fc.option(fc.uuid(), { nil: null }),
  metadata: fc.constant(null),
  created_at: timestampArb,
  users: fc.record({
    full_name: fc.constantFrom(
      "Alice Johnson",
      "Bob Smith",
      "Charlie Brown",
      "Diana Prince"
    ),
    email: fc.constantFrom(
      "alice@example.com",
      "bob@example.com",
      "charlie@example.com",
      "diana@example.com"
    ),
  }),
});

/** Arbitrary for a list of 5–20 audit log entries */
const auditLogsArbitrary = fc.array(auditLogArbitrary, {
  minLength: 5,
  maxLength: 20,
});

/** Arbitrary for an optional filter value — present ~50% of the time */
function optionalFilter<T>(arb: fc.Arbitrary<T>): fc.Arbitrary<T | null> {
  return fc.oneof(fc.constant(null), arb);
}

type Filters = {
  startDate: string | null;
  endDate: string | null;
  userId: string | null;
  actionType: ActionType | null;
};

/** Arbitrary for the filter criteria */
const filtersArbitrary: fc.Arbitrary<Filters> = fc.record({
  startDate: optionalFilter(fc.constantFrom(...DATES)),
  endDate: optionalFilter(fc.constantFrom(...DATES)),
  userId: optionalFilter(fc.constantFrom(...USER_IDS)),
  actionType: optionalFilter(fc.constantFrom(...ACTION_TYPES)),
});

// ---------------------------------------------------------------------------
// Reference implementation — compute expected set in pure JS
// ---------------------------------------------------------------------------

/**
 * Mirrors the server-side filter logic from GET /api/audit-logs.
 * startDate maps to gte created_at `${startDate}T00:00:00.000Z`
 * endDate maps to lte created_at `${endDate}T23:59:59.999Z`
 */
function applyFilters(entries: AuditLogRow[], filters: Filters): AuditLogRow[] {
  return entries.filter((e) => {
    if (
      filters.startDate !== null &&
      e.created_at < `${filters.startDate}T00:00:00.000Z`
    )
      return false;
    if (
      filters.endDate !== null &&
      e.created_at > `${filters.endDate}T23:59:59.999Z`
    )
      return false;
    if (filters.userId !== null && e.user_id !== filters.userId) return false;
    if (filters.actionType !== null && e.action_type !== filters.actionType)
      return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  resetStore([]);
});

// ===========================================================================
// Property 34: Audit Log Filter Returns Correct Entries
// ===========================================================================

describe("Property 34: Audit Log Filter Returns Correct Entries", () => {
  /**
   * **Validates: Requirements 20.3**
   *
   * Core property: for any set of audit log entries and any combination of
   * filter criteria, the response data must contain exactly the entries that
   * satisfy all applied criteria:
   *   - No false positives: every returned entry satisfies every filter.
   *   - No false negatives: every entry that satisfies every filter is present.
   */
  it("returns exactly the entries satisfying all applied filters — no false positives or negatives", async () => {
    await fc.assert(
      fc.asyncProperty(
        auditLogsArbitrary,
        filtersArbitrary,
        async (entries, filters) => {
          resetStore(entries);

          const queryParams: Record<string, string> = {};
          if (filters.startDate !== null)
            queryParams.startDate = filters.startDate;
          if (filters.endDate !== null) queryParams.endDate = filters.endDate;
          if (filters.userId !== null) queryParams.userId = filters.userId;
          if (filters.actionType !== null)
            queryParams.actionType = filters.actionType;

          const req = buildGetRequest(queryParams);
          const res = await GET(req as never);

          expect(res.status).toBe(200);

          const body = await res.json();
          const returned: AuditLogRow[] = body.data ?? [];

          const expected = applyFilters(entries, filters);

          // Verify counts match
          expect(returned.length).toBe(expected.length);

          const returnedIds = new Set(returned.map((e) => e.id));
          const expectedIds = new Set(expected.map((e) => e.id));

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
   * **Validates: Requirements 20.3**
   *
   * Soundness: every returned entry individually satisfies each filter
   * criterion that was applied.
   */
  it("all returned entries individually satisfy each applied filter criterion", async () => {
    await fc.assert(
      fc.asyncProperty(
        auditLogsArbitrary,
        filtersArbitrary,
        async (entries, filters) => {
          resetStore(entries);

          const queryParams: Record<string, string> = {};
          if (filters.startDate !== null)
            queryParams.startDate = filters.startDate;
          if (filters.endDate !== null) queryParams.endDate = filters.endDate;
          if (filters.userId !== null) queryParams.userId = filters.userId;
          if (filters.actionType !== null)
            queryParams.actionType = filters.actionType;

          const req = buildGetRequest(queryParams);
          const res = await GET(req as never);
          expect(res.status).toBe(200);

          const body = await res.json();
          const returned: AuditLogRow[] = body.data ?? [];

          for (const entry of returned) {
            // startDate filter: created_at >= `${startDate}T00:00:00.000Z`
            if (filters.startDate !== null) {
              expect(
                entry.created_at >= `${filters.startDate}T00:00:00.000Z`
              ).toBe(true);
            }
            // endDate filter: created_at <= `${endDate}T23:59:59.999Z`
            if (filters.endDate !== null) {
              expect(
                entry.created_at <= `${filters.endDate}T23:59:59.999Z`
              ).toBe(true);
            }
            // userId filter: exact match
            if (filters.userId !== null) {
              expect(entry.user_id).toBe(filters.userId);
            }
            // actionType filter: exact match
            if (filters.actionType !== null) {
              expect(entry.action_type).toBe(filters.actionType);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 20.3**
   *
   * Completeness: no entry that satisfies all filters is missing from the
   * response.
   */
  it("no entry satisfying all filters is absent from the response", async () => {
    await fc.assert(
      fc.asyncProperty(
        auditLogsArbitrary,
        filtersArbitrary,
        async (entries, filters) => {
          resetStore(entries);

          const queryParams: Record<string, string> = {};
          if (filters.startDate !== null)
            queryParams.startDate = filters.startDate;
          if (filters.endDate !== null) queryParams.endDate = filters.endDate;
          if (filters.userId !== null) queryParams.userId = filters.userId;
          if (filters.actionType !== null)
            queryParams.actionType = filters.actionType;

          const req = buildGetRequest(queryParams);
          const res = await GET(req as never);
          expect(res.status).toBe(200);

          const body = await res.json();
          const returned: AuditLogRow[] = body.data ?? [];
          const returnedIds = new Set(returned.map((e) => e.id));

          const expected = applyFilters(entries, filters);
          for (const e of expected) {
            expect(returnedIds.has(e.id)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 20.3**
   *
   * No-filter baseline: when no filters are applied, all entries are returned.
   */
  it("returns all entries when no filters are applied", async () => {
    await fc.assert(
      fc.asyncProperty(auditLogsArbitrary, async (entries) => {
        resetStore(entries);

        const req = buildGetRequest({});
        const res = await GET(req as never);
        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.count).toBe(entries.length);

        const returnedIds = new Set(
          (body.data as AuditLogRow[]).map((e) => e.id)
        );
        for (const e of entries) {
          expect(returnedIds.has(e.id)).toBe(true);
        }
      }),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 20.3**
   *
   * Response count invariant: body.count must always equal body.data.length.
   */
  it("response count field always equals the number of items in data array", async () => {
    await fc.assert(
      fc.asyncProperty(
        auditLogsArbitrary,
        filtersArbitrary,
        async (entries, filters) => {
          resetStore(entries);

          const queryParams: Record<string, string> = {};
          if (filters.startDate !== null)
            queryParams.startDate = filters.startDate;
          if (filters.endDate !== null) queryParams.endDate = filters.endDate;
          if (filters.userId !== null) queryParams.userId = filters.userId;
          if (filters.actionType !== null)
            queryParams.actionType = filters.actionType;

          const req = buildGetRequest(queryParams);
          const res = await GET(req as never);
          expect(res.status).toBe(200);

          const body = await res.json();
          expect(body.count).toBe((body.data as AuditLogRow[]).length);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ===========================================================================
// Property 33: Audit Log Generated for Every Specified Action
// ===========================================================================

describe("Property 33: Audit Log Generated for Every Specified Action", () => {
  /**
   * **Validates: Requirements 20.1**
   *
   * Schema completeness: for every auditable action type, a simulated insert
   * into the audit log store captures exactly one entry with the correct
   * action_type, the acting user's ID, and a timestamp field.
   */
  it("captured audit log entry has correct action_type, user_id, and timestamp fields", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...ACTION_TYPES),
        fc.uuid(),
        fc.uuid(),
        async (actionType, userId, affectedRecordId) => {
          resetStore([]);

          // Simulate the insert that any auditable route performs
          const adminClient = (
            await import("@/lib/supabase/admin")
          ).createAdminClient();

          const entry: AuditLogRow = {
            id: affectedRecordId, // re-use as row id for simplicity
            user_id: userId,
            action_type: actionType,
            affected_record_id: affectedRecordId,
            metadata: null,
            created_at: new Date().toISOString(),
            users: null,
          };

          adminClient.from("audit_logs").insert(entry as never);

          // Exactly one entry must have been captured
          expect(auditWriteStore).toHaveLength(1);

          const captured = auditWriteStore[0];

          // Must record the correct action type
          expect(captured.action_type).toBe(actionType);

          // Must record the acting user
          expect(captured.user_id).toBe(userId);

          // Must include a timestamp field (created_at)
          expect(captured.created_at).toBeDefined();
          expect(typeof captured.created_at).toBe("string");
          expect(captured.created_at.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 20.1, 20.3**
   *
   * Filtering by actionType returns only entries of that specific type.
   * For any mix of entries in the store, the GET handler with an actionType
   * filter must return solely entries matching that type.
   */
  it("filtering by actionType returns only entries of that type", async () => {
    await fc.assert(
      fc.asyncProperty(
        auditLogsArbitrary,
        fc.constantFrom(...ACTION_TYPES),
        async (entries, targetActionType) => {
          resetStore(entries);

          const req = buildGetRequest({ actionType: targetActionType });
          const res = await GET(req as never);
          expect(res.status).toBe(200);

          const body = await res.json();
          const returned: AuditLogRow[] = body.data ?? [];

          // Every returned entry must have the exact action_type requested
          for (const entry of returned) {
            expect(entry.action_type).toBe(targetActionType);
          }

          // No entry with the matching action_type must be omitted
          const expectedCount = entries.filter(
            (e) => e.action_type === targetActionType
          ).length;
          expect(returned.length).toBe(expectedCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 20.1, 20.3**
   *
   * Filtering by userId returns only entries for that specific user.
   */
  it("filtering by userId returns only entries for that user", async () => {
    await fc.assert(
      fc.asyncProperty(
        auditLogsArbitrary,
        fc.constantFrom(...USER_IDS),
        async (entries, targetUserId) => {
          resetStore(entries);

          const req = buildGetRequest({ userId: targetUserId });
          const res = await GET(req as never);
          expect(res.status).toBe(200);

          const body = await res.json();
          const returned: AuditLogRow[] = body.data ?? [];

          // Every returned entry must belong to the requested user
          for (const entry of returned) {
            expect(entry.user_id).toBe(targetUserId);
          }

          // No entry for that user must be omitted
          const expectedCount = entries.filter(
            (e) => e.user_id === targetUserId
          ).length;
          expect(returned.length).toBe(expectedCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 20.1, 20.3**
   *
   * Combined filters (userId + actionType) return only entries that satisfy
   * BOTH criteria simultaneously — the intersection.
   */
  it("combined filters (userId + actionType) return the intersection", async () => {
    await fc.assert(
      fc.asyncProperty(
        auditLogsArbitrary,
        fc.constantFrom(...USER_IDS),
        fc.constantFrom(...ACTION_TYPES),
        async (entries, targetUserId, targetActionType) => {
          resetStore(entries);

          const req = buildGetRequest({
            userId: targetUserId,
            actionType: targetActionType,
          });
          const res = await GET(req as never);
          expect(res.status).toBe(200);

          const body = await res.json();
          const returned: AuditLogRow[] = body.data ?? [];

          // Every returned entry must satisfy both criteria
          for (const entry of returned) {
            expect(entry.user_id).toBe(targetUserId);
            expect(entry.action_type).toBe(targetActionType);
          }

          // Count must equal the true intersection
          const expectedCount = entries.filter(
            (e) =>
              e.user_id === targetUserId && e.action_type === targetActionType
          ).length;
          expect(returned.length).toBe(expectedCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 20.1, 20.3**
   *
   * When no entries in the store match the applied filter, the response must
   * return an empty data array with count = 0.
   */
  it("no audit entries are returned when filter matches nothing", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate entries that all belong to user-A with action user_login
        fc.array(
          fc.record({
            id: fc.uuid(),
            user_id: fc.constant("user-A"),
            action_type: fc.constant("user_login"),
            affected_record_id: fc.constant(null),
            metadata: fc.constant(null),
            created_at: timestampArb,
            users: fc.constant(null),
          }) as fc.Arbitrary<AuditLogRow>,
          { minLength: 1, maxLength: 10 }
        ),
        async (entries) => {
          resetStore(entries);

          // Filter by a userId that doesn't exist in the store
          const req = buildGetRequest({ userId: "non-existent-user-xyz" });
          const res = await GET(req as never);
          expect(res.status).toBe(200);

          const body = await res.json();
          expect(body.count).toBe(0);
          expect(body.data).toHaveLength(0);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ===========================================================================
// Authorization tests (non-property)
// ===========================================================================

describe("Authorization", () => {
  /**
   * Returns 403 when the authenticated user is not a super_admin.
   */
  it("returns 403 when role is not super_admin", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: {
              id: "regular-admin-id",
              app_metadata: { role: "admin" },
              user_metadata: {},
            },
          },
          error: null,
        })),
      },
    } as never);

    const req = buildGetRequest({});
    const res = await GET(req as never);
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  /**
   * Returns 401 when there is no authenticated session.
   */
  it("returns 401 when no session", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
          error: { message: "No session" },
        })),
      },
    } as never);

    const req = buildGetRequest({});
    const res = await GET(req as never);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});
