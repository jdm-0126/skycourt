/**
 * Property-based tests: Backup Completion Atomicity
 *
 * **Validates: Requirements 21.3**
 *
 * Property 35: Backup Completion Is Atomic
 *   For any backup that actually completes, the `backup_history` record must
 *   be updated to set BOTH `status = 'completed'` AND `completed_at` timestamp
 *   in the SAME atomic `.update()` call — it must never be possible to observe
 *   one without the other.
 *
 *   Additionally, for any backup that ends (success or per-table soft error),
 *   the status must never remain as 'in_progress' after the route handler
 *   returns.
 *
 * Strategy:
 *   - Mock `@/lib/supabase/server` so auth.getUser returns a super_admin.
 *   - Mock `@/lib/supabase/admin` with a fully-chainable builder that:
 *       • Captures every `.insert()` call on backup_history.
 *       • Captures every `.update()` call payload on backup_history (the
 *         atomic update we want to inspect).
 *       • Handles the per-table `.select()` count queries (using a lazy read
 *         of `forcedExportErrorTable` so per-test control works correctly).
 *   - Generate varied inputs via fast-check, then assert the update payload
 *     invariants hold for every run.
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UpdatePayload = Record<string, unknown>;

// ---------------------------------------------------------------------------
// In-memory capture stores — read lazily by the mock factory
// ---------------------------------------------------------------------------

/** Each element is the payload passed to a single backup_history .update(). */
let capturedUpdates: UpdatePayload[];

/** Each element is the payload passed to backup_history .insert(). */
let capturedInserts: UpdatePayload[];

/**
 * When non-null, the count query for THIS table will return an error
 * (simulating a soft per-table export failure that is handled gracefully,
 * logging count = -1 but NOT throwing — backup still completes).
 */
let forcedExportErrorTable: string | null;

function resetStores() {
  capturedUpdates = [];
  capturedInserts = [];
  forcedExportErrorTable = null;
}

// ---------------------------------------------------------------------------
// Mock @/lib/supabase/server — returns a super_admin user
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
// Mock @/lib/supabase/admin — chainable builder that captures update payloads
//
// The POST /api/backup route performs operations in this order:
//   1. adminClient.from("backup_history").insert({...}).select().single()
//      → must return a record with an `id`
//   2. adminClient.from("audit_logs").insert({...})
//      → non-fatal; we ignore
//   3. For each table in TABLES (includes "backup_history"):
//        adminClient.from(table).select("*", { count: "exact", head: true })
//      → returns { count: N, error: null } (or count: null, error: {...})
//   4. adminClient.from("backup_history").update(payload).eq("id",id).select().single()
//      → THIS is the atomic update we want to inspect
//
// Key design:
//   - All `from(table)` calls read module-level state (capturedUpdates,
//     capturedInserts, forcedExportErrorTable) lazily — i.e., at call time,
//     not at vi.mock factory build time.
//   - We track HOW MANY TIMES "backup_history".insert vs .update vs .select
//     have been called using a simple counter so the builder can dispatch to
//     the right handler on subsequent calls to the same table.
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => {
    const backupId = "test-backup-id-12345";

    // Call-order counters for backup_history to distinguish insert vs select
    // (both return different shapes).
    let backupHistoryInsertCalled = false;

    return {
      from: vi.fn((table: string) => {
        // -----------------------------------------------------------------
        // backup_history — handles insert, update, and select (count query)
        // -----------------------------------------------------------------
        if (table === "backup_history") {
          return {
            // Step 1: .insert({...}).select().single() → initial row
            insert: vi.fn((data: UpdatePayload) => {
              backupHistoryInsertCalled = true;
              capturedInserts.push(data);
              return {
                select: vi.fn(() => ({
                  single: vi.fn(() =>
                    Promise.resolve({
                      data: { id: backupId, status: "in_progress", started_at: new Date().toISOString() },
                      error: null,
                    })
                  ),
                })),
              };
            }),

            // Step 3 (loop): .select("*", { count: "exact", head: true })
            // This is a count query — returns { count, error }.
            select: vi.fn(() => {
              // The count query is awaited directly on the chain; we need to
              // return a thenable that resolves to { count, error }.
              return Promise.resolve({ count: 10, error: null });
            }),

            // Step 4: .update(payload).eq("id", id).select().single()
            update: vi.fn((payload: UpdatePayload) => {
              capturedUpdates.push(payload);
              return {
                eq: vi.fn(() => ({
                  select: vi.fn(() => ({
                    single: vi.fn(() =>
                      Promise.resolve({
                        data: { id: backupId, ...payload },
                        error: null,
                      })
                    ),
                  })),
                })),
              };
            }),
          };
        }

        // -----------------------------------------------------------------
        // audit_logs — handles insert (audit write); also handles select
        // (count query) if audit_logs appears in TABLES.
        // -----------------------------------------------------------------
        if (table === "audit_logs") {
          return {
            insert: vi.fn(() => ({ error: null })),
            select: vi.fn(() => {
              // Lazy read: check forcedExportErrorTable at call time
              const shouldError = forcedExportErrorTable === "audit_logs";
              return Promise.resolve(
                shouldError
                  ? { count: null, error: { message: "Simulated error on audit_logs" } }
                  : { count: 3, error: null }
              );
            }),
          };
        }

        // -----------------------------------------------------------------
        // All other tables — per-table count queries only.
        // Lazy read of forcedExportErrorTable at call time.
        // -----------------------------------------------------------------
        return {
          select: vi.fn(() => {
            const shouldError = forcedExportErrorTable === table;
            return Promise.resolve(
              shouldError
                ? { count: null, error: { message: `Simulated error on ${table}` } }
                : { count: 5, error: null }
            );
          }),
        };
      }),
    };
  }),
}));

// ---------------------------------------------------------------------------
// Import POST handler AFTER mocks are set up
// ---------------------------------------------------------------------------

import { POST } from "@/app/api/backup/route";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildPostRequest(): NextRequest {
  return new NextRequest("http://localhost/api/backup", { method: "POST" });
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Tables scanned by the backup route (mirrors TABLES in route.ts) */
const BACKUP_TABLES = [
  "users",
  "courts",
  "court_unavailable_dates",
  "bookings",
  "website_content",
  "gallery_images",
  "contact_messages",
  "audit_logs",
  "roles",
  "backup_history",
  "system_settings",
] as const;

type BackupTable = (typeof BACKUP_TABLES)[number];

/**
 * Arbitrary: either null (all tables succeed) or a specific table name
 * (that table returns a soft error, causing count = -1 in the export meta
 * but NOT throwing — backup still completes with status = 'completed').
 */
const exportErrorArb: fc.Arbitrary<BackupTable | null> = fc.oneof(
  { weight: 2, arbitrary: fc.constant(null) },
  { weight: 1, arbitrary: fc.constantFrom(...BACKUP_TABLES) }
);

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  resetStores();
});

// ===========================================================================
// Property 35: Backup Completion Is Atomic
// ===========================================================================

describe("Property 35: Backup Completion Is Atomic", () => {
  /**
   * **Validates: Requirements 21.3**
   *
   * Core atomicity property: for any backup that completes successfully
   * (status = 'completed'), the update payload must ALWAYS contain BOTH
   * `status` AND `completed_at` in the same object — never one without the
   * other.
   */
  it("completed backup update payload always contains both status and completed_at simultaneously", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }),
        async (_seed) => {
          resetStores();

          const req = buildPostRequest();
          const res = await POST(req as never);

          // Route must succeed (201)
          expect(res.status).toBe(201);

          // Exactly one update must have been issued
          expect(capturedUpdates).toHaveLength(1);
          const payload = capturedUpdates[0];

          // The update must set status = 'completed'
          expect(payload.status).toBe("completed");

          // The update must ALSO include completed_at — atomicity guarantee
          expect(payload).toHaveProperty("completed_at");
          expect(typeof payload.completed_at).toBe("string");
          expect((payload.completed_at as string).length).toBeGreaterThan(0);

          // Verify it is a valid ISO 8601 timestamp
          const ts = new Date(payload.completed_at as string);
          expect(Number.isNaN(ts.getTime())).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 21.3**
   *
   * Completeness invariant: the update payload must never contain ONLY
   * `status` without `completed_at`, and never contain ONLY `completed_at`
   * without `status` — both fields must always co-exist in the same payload.
   */
  it("update payload never sets status alone or completed_at alone — both must be present together", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }),
        async (_seed) => {
          resetStores();

          const req = buildPostRequest();
          await POST(req as never);

          expect(capturedUpdates).toHaveLength(1);
          const payload = capturedUpdates[0];

          const hasStatus = Object.prototype.hasOwnProperty.call(payload, "status");
          const hasCompletedAt = Object.prototype.hasOwnProperty.call(payload, "completed_at");

          // Both MUST be present — atomicity means neither can be set alone
          expect(hasStatus).toBe(true);
          expect(hasCompletedAt).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 21.3**
   *
   * Terminal state invariant: after the route handler returns, the backup
   * record must NEVER be left with status = 'in_progress'. It must always
   * transition to either 'completed' or 'failed'.
   */
  it("backup status is never left as in_progress after the route returns", async () => {
    await fc.assert(
      fc.asyncProperty(
        exportErrorArb,
        async (errorTable) => {
          resetStores();
          forcedExportErrorTable = errorTable;

          const req = buildPostRequest();
          const res = await POST(req as never);

          // Route should always return 201
          expect(res.status).toBe(201);

          // At least one update must have been captured
          expect(capturedUpdates.length).toBeGreaterThanOrEqual(1);

          const finalPayload = capturedUpdates[capturedUpdates.length - 1];

          // Status must be terminal — never 'in_progress'
          expect(finalPayload.status).not.toBe("in_progress");
          expect(["completed", "failed"]).toContain(finalPayload.status);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 21.3**
   *
   * completed_at is an ISO timestamp: when status = 'completed', the
   * `completed_at` value must parse as a valid date that is after 2020.
   */
  it("completed_at in a completed backup is a valid, non-epoch ISO timestamp", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }),
        async (_seed) => {
          resetStores();

          const req = buildPostRequest();
          await POST(req as never);

          expect(capturedUpdates).toHaveLength(1);
          const payload = capturedUpdates[0];

          if (payload.status === "completed") {
            const ts = new Date(payload.completed_at as string);
            // Must be a real date
            expect(Number.isNaN(ts.getTime())).toBe(false);
            // Must be after the epoch
            expect(ts.getTime()).toBeGreaterThan(0);
            // Must be a plausible recent timestamp (after year 2020)
            expect(ts.getFullYear()).toBeGreaterThanOrEqual(2020);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 21.3**
   *
   * Single-update guarantee: the route must issue exactly ONE `.update()` call
   * on backup_history per POST request. Multiple partial updates would violate
   * the atomicity requirement (e.g. first setting status, then setting
   * completed_at in a second call).
   */
  it("exactly one update call is issued per backup request — no split updates", async () => {
    await fc.assert(
      fc.asyncProperty(
        exportErrorArb,
        async (errorTable) => {
          resetStores();
          forcedExportErrorTable = errorTable;

          const req = buildPostRequest();
          const res = await POST(req as never);

          expect(res.status).toBe(201);

          // Atomicity means a single update — never two separate updates
          expect(capturedUpdates).toHaveLength(1);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 21.3**
   *
   * Initial insert uses status = 'in_progress': the backup_history row must
   * be created with status = 'in_progress' before the atomic update, ensuring
   * the observable state transition is: in_progress → (completed | failed).
   */
  it("backup_history row is initially inserted with status = in_progress before the atomic update", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }),
        async (_seed) => {
          resetStores();

          const req = buildPostRequest();
          await POST(req as never);

          // The insert must have happened
          expect(capturedInserts).toHaveLength(1);
          expect(capturedInserts[0].status).toBe("in_progress");

          // And was followed by a single atomic update to a terminal state
          expect(capturedUpdates).toHaveLength(1);
          expect(["completed", "failed"]).toContain(capturedUpdates[0].status);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 21.3**
   *
   * Soft per-table export errors do not prevent completion: even when a
   * specific table's count query returns an error (count = -1), the backup
   * still reaches status = 'completed' because the route handles these errors
   * gracefully without throwing.
   */
  it("soft per-table export errors still result in a completed backup with both status and completed_at", async () => {
    await fc.assert(
      fc.asyncProperty(
        exportErrorArb,
        async (errorTable) => {
          resetStores();
          forcedExportErrorTable = errorTable;

          const req = buildPostRequest();
          const res = await POST(req as never);

          expect(res.status).toBe(201);
          expect(capturedUpdates).toHaveLength(1);

          const payload = capturedUpdates[0];

          // Soft errors (returned error objects) don't trigger the catch
          // block, so status is always 'completed'
          expect(payload.status).toBe("completed");

          // completed_at must still be present
          expect(payload).toHaveProperty("completed_at");
          expect(typeof payload.completed_at).toBe("string");
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
  it("returns 401 when there is no authenticated session", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
          error: { message: "No session" },
        })),
      },
    } as never);

    const req = buildPostRequest();
    const res = await POST(req as never);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 403 when the user is not a super_admin", async () => {
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

    const req = buildPostRequest();
    const res = await POST(req as never);
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});
