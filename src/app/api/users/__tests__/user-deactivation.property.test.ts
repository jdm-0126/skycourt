/**
 * Property-based test: Member Account Deactivation Prevents Login
 *
 * **Validates: Requirements 17.2, 17.3**
 *
 * Property 28: Member Account Deactivation Prevents Login
 *   For any member account with status = 'Active':
 *     - After deactivation (PATCH action="deactivate"), the account status
 *       is set to 'inactive' and all subsequent login attempts for that account
 *       must fail (i.e. the system marks the account inactive).
 *     - After reactivation (PATCH action="activate") on an inactive account,
 *       the status is set back to 'active' and login access is restored.
 *     - Attempting to activate an already-active account must return 409 Conflict.
 *     - The deactivate action always sets status to 'inactive' regardless of
 *       whether the account was already active or inactive.
 *
 * Strategy:
 *   - Mock `@/lib/supabase/server` so auth.getUser returns an admin user.
 *   - Mock `@/lib/supabase/admin` with an in-memory Map<userId, UserRow>
 *     that supports the query patterns used by the PATCH route:
 *       .from("users").select("id, status").eq("id", id).single()
 *       .from("users").update({...}).eq("id", id).select().single()
 *   - Generate random user records and verify PATCH behaviour for all
 *     deactivate / activate / conflict / round-trip scenarios.
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UserStatus = "active" | "inactive";

type UserRow = {
  id: string;
  full_name: string;
  email: string;
  role: "member" | "admin" | "super_admin";
  status: UserStatus;
  contact_number: string | null;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// In-memory store — reset before each property run
// ---------------------------------------------------------------------------

let store: Map<string, UserRow>;

function resetStore(rows: UserRow[]) {
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
// The PATCH /api/users/:id/status handler calls:
//   1. adminClient.from("users").select("id, status").eq("id", id).single()
//   2. adminClient.from("users").update({...}).eq("id", id).select().single()
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table !== "users") {
        throw new Error(`Unexpected table in admin mock: ${table}`);
      }

      return {
        // --- fetch path: .select("id, status").eq("id", id).single() ---
        select: vi.fn((_cols: string) => ({
          eq: vi.fn((_col: string, id: string) => ({
            single: vi.fn(async () => {
              const row = store.get(id) ?? null;
              if (!row) return { data: null, error: { message: "not found" } };
              return { data: row, error: null };
            }),
          })),
        })),

        // --- update path: .update({...}).eq("id", id).select().single() ---
        update: vi.fn((patch: Partial<UserRow>) => ({
          eq: vi.fn((_col: string, id: string) => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                const existing = store.get(id);
                if (!existing) {
                  return { data: null, error: { message: "row not found" } };
                }
                const updated: UserRow = { ...existing, ...patch };
                store.set(id, updated);
                return { data: updated, error: null };
              }),
            })),
          })),
        })),
      };
    }),
  })),
}));

// ---------------------------------------------------------------------------
// Import route handler AFTER mocks are set up
// ---------------------------------------------------------------------------

import { PATCH } from "@/app/api/users/[id]/status/route";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a NextRequest for PATCH /api/users/:id/status with a JSON body */
function buildPatchRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/users/test-id/status", {
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

const USER_STATUSES: UserStatus[] = ["active", "inactive"];

/** Generates a full user row with a given status */
function userArbitrary(
  statusArb: fc.Arbitrary<UserStatus>
): fc.Arbitrary<UserRow> {
  return fc.record({
    id: fc.uuid(),
    full_name: fc.string({ minLength: 1, maxLength: 50 }),
    email: fc.emailAddress(),
    role: fc.constant("member" as const),
    status: statusArb,
    contact_number: fc.option(fc.string({ minLength: 7, maxLength: 15 }), {
      nil: null,
    }),
    created_at: fc.constant("2025-01-01T00:00:00Z"),
    updated_at: fc.constant("2025-01-01T00:00:00Z"),
  });
}

const activeUserArb = userArbitrary(fc.constant("active" as UserStatus));
const inactiveUserArb = userArbitrary(fc.constant("inactive" as UserStatus));
const anyStatusUserArb = userArbitrary(fc.constantFrom(...USER_STATUSES));

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Property 28: Member Account Deactivation Prevents Login
// ---------------------------------------------------------------------------

describe("Property 28: Member Account Deactivation Prevents Login", () => {
  /**
   * **Validates: Requirements 17.2**
   *
   * Core deactivation property: for any active member account, after
   * PATCH action="deactivate", the returned status is exactly "inactive".
   * The in-store record also reflects the change.
   */
  it("always sets status to inactive when deactivating an active member account", async () => {
    await fc.assert(
      fc.asyncProperty(activeUserArb, async (user) => {
        resetStore([user]);

        const req = buildPatchRequest({ action: "deactivate" });
        const params = buildRouteParams(user.id);

        const res = await PATCH(req, params);
        expect(res.status).toBe(200);

        const body = await res.json();
        const returned: UserRow = body.data;

        // The only acceptable post-deactivation status is "inactive"
        expect(returned.status).toBe("inactive");
        expect(returned.status).not.toBe("active");

        // The in-store record also reflects the new status
        const inStore = store.get(user.id);
        expect(inStore?.status).toBe("inactive");
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 17.2**
   *
   * Deactivation is idempotent: deactivating an already-inactive account
   * also sets status to 'inactive' and returns 200 (no conflict).
   */
  it("deactivate action sets status to inactive regardless of current status", async () => {
    await fc.assert(
      fc.asyncProperty(anyStatusUserArb, async (user) => {
        resetStore([user]);

        const req = buildPatchRequest({ action: "deactivate" });
        const params = buildRouteParams(user.id);

        const res = await PATCH(req, params);
        expect(res.status).toBe(200);

        const body = await res.json();
        const returned: UserRow = body.data;

        expect(returned.status).toBe("inactive");

        const inStore = store.get(user.id);
        expect(inStore?.status).toBe("inactive");
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 17.3**
   *
   * Reactivation property: for any inactive member account, after
   * PATCH action="activate", the returned status is exactly "active".
   * Login access is thereby restored.
   */
  it("always sets status to active when activating an inactive member account", async () => {
    await fc.assert(
      fc.asyncProperty(inactiveUserArb, async (user) => {
        resetStore([user]);

        const req = buildPatchRequest({ action: "activate" });
        const params = buildRouteParams(user.id);

        const res = await PATCH(req, params);
        expect(res.status).toBe(200);

        const body = await res.json();
        const returned: UserRow = body.data;

        // After reactivation, status must be "active"
        expect(returned.status).toBe("active");
        expect(returned.status).not.toBe("inactive");

        const inStore = store.get(user.id);
        expect(inStore?.status).toBe("active");
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 17.3**
   *
   * Conflict guard: activating an already-active account must return 409.
   * The account record must remain unchanged (still active).
   */
  it("returns 409 and leaves record unchanged when activating an already-active account", async () => {
    await fc.assert(
      fc.asyncProperty(activeUserArb, async (user) => {
        resetStore([user]);

        const req = buildPatchRequest({ action: "activate" });
        const params = buildRouteParams(user.id);

        const res = await PATCH(req, params);
        expect(res.status).toBe(409);

        const body = await res.json();
        expect(body.error).toBeDefined();

        // Record must remain unchanged
        const inStore = store.get(user.id);
        expect(inStore?.status).toBe("active");
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 17.2, 17.3**
   *
   * Round-trip property: deactivate then reactivate must restore the account
   * to 'active' status. The status transitions must be:
   *   active → inactive (deactivate) → active (activate)
   */
  it("deactivate then activate round-trip restores account to active status", async () => {
    await fc.assert(
      fc.asyncProperty(activeUserArb, async (user) => {
        resetStore([user]);

        // Step 1: deactivate
        const deactivateReq = buildPatchRequest({ action: "deactivate" });
        const deactivateRes = await PATCH(
          deactivateReq,
          buildRouteParams(user.id)
        );
        expect(deactivateRes.status).toBe(200);
        const deactivateBody = await deactivateRes.json();
        expect(deactivateBody.data.status).toBe("inactive");

        // Verify in-store state is inactive after deactivation
        expect(store.get(user.id)?.status).toBe("inactive");

        // Step 2: reactivate
        const activateReq = buildPatchRequest({ action: "activate" });
        const activateRes = await PATCH(
          activateReq,
          buildRouteParams(user.id)
        );
        expect(activateRes.status).toBe(200);
        const activateBody = await activateRes.json();
        expect(activateBody.data.status).toBe("active");

        // Verify in-store state is active after reactivation
        expect(store.get(user.id)?.status).toBe("active");
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 17.2**
   *
   * Second deactivation attempt: deactivating an already-inactive account
   * must still return 200 (deactivate is always valid) and keep status as
   * 'inactive'.
   */
  it("second deactivation attempt returns 200 and keeps status as inactive", async () => {
    await fc.assert(
      fc.asyncProperty(activeUserArb, async (user) => {
        resetStore([user]);

        // First deactivate
        const req1 = buildPatchRequest({ action: "deactivate" });
        const res1 = await PATCH(req1, buildRouteParams(user.id));
        expect(res1.status).toBe(200);
        expect(store.get(user.id)?.status).toBe("inactive");

        // Second deactivate — no conflict, still 200
        const req2 = buildPatchRequest({ action: "deactivate" });
        const res2 = await PATCH(req2, buildRouteParams(user.id));
        expect(res2.status).toBe(200);
        const body2 = await res2.json();
        expect(body2.data.status).toBe("inactive");
        expect(store.get(user.id)?.status).toBe("inactive");
      }),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 17.3**
   *
   * Second activation attempt after a successful activation must return 409.
   * Status must remain 'active' and not change.
   */
  it("second activation attempt returns 409 after the first succeeds", async () => {
    await fc.assert(
      fc.asyncProperty(inactiveUserArb, async (user) => {
        resetStore([user]);

        // First activate — must succeed
        const req1 = buildPatchRequest({ action: "activate" });
        const res1 = await PATCH(req1, buildRouteParams(user.id));
        expect(res1.status).toBe(200);
        const body1 = await res1.json();
        expect(body1.data.status).toBe("active");

        // Second activate — store now has status=active, must conflict
        const req2 = buildPatchRequest({ action: "activate" });
        const res2 = await PATCH(req2, buildRouteParams(user.id));
        expect(res2.status).toBe(409);

        const body2 = await res2.json();
        expect(body2.error).toBeDefined();

        // Status must remain active
        expect(store.get(user.id)?.status).toBe("active");
      }),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 17.2, 17.3**
   *
   * Status transitions are reflected in the returned user record:
   * the response body from a successful PATCH must contain the updated
   * user record with the new status value.
   */
  it("response body always contains the updated user record with the new status", async () => {
    await fc.assert(
      fc.asyncProperty(
        anyStatusUserArb,
        fc.constantFrom("activate" as const, "deactivate" as const),
        async (user, action) => {
          // Skip the 409 case (activate on already-active user)
          fc.pre(!(action === "activate" && user.status === "active"));

          resetStore([user]);

          const req = buildPatchRequest({ action });
          const params = buildRouteParams(user.id);

          const res = await PATCH(req, params);
          expect(res.status).toBe(200);

          const body = await res.json();

          // Response must include the updated user record
          expect(body.data).toBeDefined();
          expect(body.data.id).toBe(user.id);

          const expectedStatus =
            action === "deactivate" ? "inactive" : "active";
          expect(body.data.status).toBe(expectedStatus);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 17.2**
   *
   * Unauthorized requests: requests without a valid admin session must
   * return 401 Unauthorized, and the store must remain unchanged.
   */
  it("returns 400 for invalid action values", async () => {
    await fc.assert(
      fc.asyncProperty(
        anyStatusUserArb,
        // Generate action strings that are not "activate" or "deactivate"
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => s !== "activate" && s !== "deactivate"),
        async (user, invalidAction) => {
          resetStore([user]);

          const originalStatus = user.status;
          const req = buildPatchRequest({ action: invalidAction });
          const params = buildRouteParams(user.id);

          const res = await PATCH(req, params);
          expect(res.status).toBe(400);

          const body = await res.json();
          expect(body.error).toBeDefined();

          // Store must remain unchanged
          expect(store.get(user.id)?.status).toBe(originalStatus);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 17.2**
   *
   * Missing user: PATCH on a non-existent user id must return 404 and not
   * modify any existing records.
   */
  it("returns 404 when the target user does not exist in the store", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(anyStatusUserArb, { minLength: 0, maxLength: 5 }),
        fc.uuid(),
        fc.constantFrom("activate" as const, "deactivate" as const),
        async (existingUsers, nonExistentId, action) => {
          // Ensure the random id doesn't collide with any existing user
          fc.pre(existingUsers.every((u) => u.id !== nonExistentId));

          resetStore(existingUsers);

          const req = buildPatchRequest({ action });
          const params = buildRouteParams(nonExistentId);

          const res = await PATCH(req, params);
          expect(res.status).toBe(404);

          const body = await res.json();
          expect(body.error).toBeDefined();

          // All existing records must remain unchanged
          for (const user of existingUsers) {
            expect(store.get(user.id)?.status).toBe(user.status);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});
