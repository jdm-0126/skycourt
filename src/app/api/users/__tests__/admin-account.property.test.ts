/**
 * Property-based tests: Admin Account Management
 *
 * **Validates: Requirements 18.1, 18.2, 18.4**
 *
 * Property 29: Admin Account Creation Assigns Admin Role
 *   For any valid super-admin-initiated admin account creation (unique email,
 *   name, password), the resulting user record must have role = 'admin'.
 *
 * Property 30: Admin Deactivation Terminates All Sessions
 *   For any admin account with one or more active sessions, a super_admin
 *   deactivation must set status = 'inactive' so the middleware blocks
 *   further requests.
 *
 * Strategy:
 *   - Mock `@/lib/supabase/server` so auth.getUser returns a super_admin user.
 *   - Mock `@/lib/supabase/admin` with:
 *       - For POST: in-memory store + fake auth.admin.createUser that returns a UUID
 *       - For PATCH: in-memory Map<userId, UserRow> supporting the query
 *         patterns used by the PATCH route.
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { v4 as uuidv4 } from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UserStatus = "active" | "inactive";
type UserRole = "member" | "admin" | "super_admin";

type UserRow = {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  contact_number: string | null;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

/** Used by both POST (insert) and PATCH (select/update) tests */
let store: Map<string, UserRow>;

/** Tracks audit log inserts */
let auditLogs: unknown[];

/** Tracks auth users created */
let authStore: Map<string, { email: string }>;

function resetStores(rows: UserRow[] = []) {
  store = new Map(rows.map((r) => [r.id, r]));
  auditLogs = [];
  authStore = new Map();
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
// Mock @/lib/supabase/admin
//
// Supports the query patterns used by both route handlers:
//
// POST /api/users/admin:
//   adminClient.auth.admin.createUser({ email, password, email_confirm })
//   adminClient.auth.admin.deleteUser(id)                         ← rollback
//   adminClient.from("users").insert({...}).select().single()
//   adminClient.from("audit_logs").insert({...})
//
// PATCH /api/users/:id/admin-status:
//   adminClient.from("users").select("...").eq("id",id).eq("role","admin").single()
//   adminClient.from("users").update({...}).eq("id",id).select().single()
//   adminClient.from("audit_logs").insert({...})
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => {
    // Deterministic fake UUID counter so each createUser call gets a new id
    let fakeUidCounter = 0;

    return {
      // -----------------------------------------------------------------------
      // auth.admin helpers (used by POST handler)
      // -----------------------------------------------------------------------
      auth: {
        admin: {
          createUser: vi.fn(
            async ({
              email,
            }: {
              email: string;
              password: string;
              email_confirm: boolean;
            }) => {
              // Reject duplicate emails
              for (const [, v] of authStore) {
                if (v.email === email) {
                  return {
                    data: { user: null },
                    error: {
                      message: "User already registered",
                      status: 422,
                    },
                  };
                }
              }
              fakeUidCounter += 1;
              const newId = `fake-auth-uid-${fakeUidCounter}`;
              authStore.set(newId, { email });
              return {
                data: { user: { id: newId, email } },
                error: null,
              };
            }
          ),
          deleteUser: vi.fn(async (id: string) => {
            authStore.delete(id);
            return { error: null };
          }),
        },
      },

      // -----------------------------------------------------------------------
      // from() — chainable builder over in-memory store
      // -----------------------------------------------------------------------
      from: vi.fn((table: string) => {
        if (table === "audit_logs") {
          return {
            insert: vi.fn(() => ({ error: null })),
          };
        }

        if (table !== "users") {
          throw new Error(`Unexpected table in admin mock: ${table}`);
        }

        return {
          // ------------------------------------------------------------------
          // POST path: .insert({...}).select().single()
          // ------------------------------------------------------------------
          insert: vi.fn((row: UserRow) => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                // Simulate duplicate email at DB level
                for (const [, existing] of store) {
                  if (existing.email === row.email) {
                    return {
                      data: null,
                      error: { message: "duplicate key value" },
                    };
                  }
                }
                const newRow: UserRow = {
                  ...row,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };
                store.set(newRow.id, newRow);
                return { data: newRow, error: null };
              }),
            })),
          })),

          // ------------------------------------------------------------------
          // PATCH fetch path: .select("...").eq("id",id).eq("role","admin").single()
          // ------------------------------------------------------------------
          select: vi.fn((_cols: string) => ({
            eq: vi.fn((_col1: string, val1: string) => ({
              eq: vi.fn((_col2: string, _val2: string) => ({
                single: vi.fn(async () => {
                  // col1 is "id", val1 is the target id
                  // col2 is "role", val2 is "admin" — filter by both
                  const row = store.get(val1) ?? null;
                  if (!row || row.role !== "admin") {
                    return {
                      data: null,
                      error: { message: "not found" },
                    };
                  }
                  return { data: row, error: null };
                }),
              })),
              // Single .eq() fallback (not used by these routes but guard)
              single: vi.fn(async () => {
                const row = store.get(val1) ?? null;
                if (!row) return { data: null, error: { message: "not found" } };
                return { data: row, error: null };
              }),
            })),
          })),

          // ------------------------------------------------------------------
          // PATCH update path: .update({...}).eq("id",id).select().single()
          // ------------------------------------------------------------------
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
    };
  }),
}));

// ---------------------------------------------------------------------------
// Import route handlers AFTER mocks are set up
// ---------------------------------------------------------------------------

import { POST } from "@/app/api/users/admin/route";
import { PATCH } from "@/app/api/users/[id]/admin-status/route";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildPostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/users/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function buildPatchRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/users/test-id/admin-status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function buildRouteParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const USER_STATUSES: UserStatus[] = ["active", "inactive"];

/** Generates a valid admin creation payload */
const adminCreationPayloadArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  email: fc.emailAddress(),
  // Passwords must be at least 8 characters
  password: fc.string({ minLength: 8, maxLength: 32 }),
});

/** Generates a full admin user row */
function adminUserArbitrary(
  statusArb: fc.Arbitrary<UserStatus>
): fc.Arbitrary<UserRow> {
  return fc.record({
    id: fc.uuid(),
    full_name: fc.string({ minLength: 1, maxLength: 50 }),
    email: fc.emailAddress(),
    role: fc.constant("admin" as const),
    status: statusArb,
    contact_number: fc.option(fc.string({ minLength: 7, maxLength: 15 }), {
      nil: null,
    }),
    created_at: fc.constant("2025-01-01T00:00:00Z"),
    updated_at: fc.constant("2025-01-01T00:00:00Z"),
  });
}

const activeAdminArb = adminUserArbitrary(fc.constant("active" as UserStatus));
const inactiveAdminArb = adminUserArbitrary(fc.constant("inactive" as UserStatus));
const anyStatusAdminArb = adminUserArbitrary(fc.constantFrom(...USER_STATUSES));

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  resetStores();
});

// ===========================================================================
// Property 29: Admin Account Creation Assigns Admin Role
// ===========================================================================

describe("Property 29: Admin Account Creation Assigns Admin Role", () => {
  /**
   * **Validates: Requirements 18.1**
   *
   * Core property: for any valid creation payload (name, email ≥8-char password),
   * the POST handler must return 201 and the user record in the response body
   * must have role = 'admin'.
   */
  it("always sets role to admin for any valid creation payload", async () => {
    await fc.assert(
      fc.asyncProperty(adminCreationPayloadArb, async (payload) => {
        resetStores();

        const req = buildPostRequest(payload);
        const res = await POST(req);
        expect(res.status).toBe(201);

        const body = await res.json();
        const created: UserRow = body.data;

        // The only acceptable role on a newly created admin account is 'admin'
        expect(created.role).toBe("admin");
        expect(created.role).not.toBe("member");
        expect(created.role).not.toBe("super_admin");
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 18.1**
   *
   * The in-store record must also have role = 'admin' (not just the response).
   */
  it("persists role = admin in the data store for any valid creation payload", async () => {
    await fc.assert(
      fc.asyncProperty(adminCreationPayloadArb, async (payload) => {
        resetStores();

        const req = buildPostRequest(payload);
        const res = await POST(req);
        expect(res.status).toBe(201);

        const body = await res.json();
        const returnedId: string = body.data.id;

        const inStore = store.get(returnedId);
        expect(inStore).toBeDefined();
        expect(inStore?.role).toBe("admin");
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 18.1, 18.2**
   *
   * The created admin account must also have status = 'active' by default.
   */
  it("always sets status to active for a newly created admin account", async () => {
    await fc.assert(
      fc.asyncProperty(adminCreationPayloadArb, async (payload) => {
        resetStores();

        const req = buildPostRequest(payload);
        const res = await POST(req);
        expect(res.status).toBe(201);

        const body = await res.json();
        const created: UserRow = body.data;

        expect(created.status).toBe("active");
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 18.1**
   *
   * Duplicate email must return 409 Conflict, not create a second admin.
   */
  it("returns 409 when attempting to create an admin with an already-registered email", async () => {
    await fc.assert(
      fc.asyncProperty(adminCreationPayloadArb, async (payload) => {
        resetStores();

        // First creation — must succeed
        const req1 = buildPostRequest(payload);
        const res1 = await POST(req1);
        expect(res1.status).toBe(201);

        // Second creation with same email — must conflict
        const req2 = buildPostRequest(payload);
        const res2 = await POST(req2);
        expect(res2.status).toBe(409);

        const body2 = await res2.json();
        expect(body2.error).toBeDefined();

        // Only one user with this email should be in the store
        let count = 0;
        for (const [, u] of store) {
          if (u.email === payload.email.toLowerCase().trim()) count++;
        }
        expect(count).toBe(1);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 18.1**
   *
   * Invalid payload — missing or too-short password — must return 400.
   */
  it("returns 400 for passwords shorter than 8 characters", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
          email: fc.emailAddress(),
          password: fc.string({ minLength: 1, maxLength: 7 }),
        }),
        async (payload) => {
          resetStores();

          const req = buildPostRequest(payload);
          const res = await POST(req);
          expect(res.status).toBe(400);

          const body = await res.json();
          expect(body.error).toBeDefined();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 18.1**
   *
   * Response body email must match the supplied email (normalized to lowercase).
   */
  it("normalizes email to lowercase in the created record", async () => {
    await fc.assert(
      fc.asyncProperty(adminCreationPayloadArb, async (payload) => {
        resetStores();

        const req = buildPostRequest(payload);
        const res = await POST(req);
        expect(res.status).toBe(201);

        const body = await res.json();
        const created: UserRow = body.data;

        expect(created.email).toBe(payload.email.trim().toLowerCase());
      }),
      { numRuns: 100 }
    );
  });
});

// ===========================================================================
// Property 30: Admin Deactivation Terminates All Sessions
// ===========================================================================

describe("Property 30: Admin Deactivation Terminates All Sessions", () => {
  /**
   * **Validates: Requirements 18.4**
   *
   * Core deactivation property: for any active admin account, after
   * PATCH action="deactivate", the returned status is exactly "inactive".
   * The middleware will block further requests for that user.
   */
  it("always sets status to inactive when deactivating an active admin account", async () => {
    await fc.assert(
      fc.asyncProperty(activeAdminArb, async (admin) => {
        resetStores([admin]);

        const req = buildPatchRequest({ action: "deactivate" });
        const params = buildRouteParams(admin.id);

        const res = await PATCH(req, params);
        expect(res.status).toBe(200);

        const body = await res.json();
        const returned: UserRow = body.data;

        // After deactivation the status must be 'inactive' — middleware blocks requests
        expect(returned.status).toBe("inactive");
        expect(returned.status).not.toBe("active");

        // In-store record also reflects the change
        const inStore = store.get(admin.id);
        expect(inStore?.status).toBe("inactive");
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 18.4**
   *
   * Deactivation is always valid regardless of current status (no 409 for
   * already-inactive). The result is always 'inactive'.
   */
  it("deactivate action sets status to inactive regardless of current status", async () => {
    await fc.assert(
      fc.asyncProperty(anyStatusAdminArb, async (admin) => {
        resetStores([admin]);

        const req = buildPatchRequest({ action: "deactivate" });
        const params = buildRouteParams(admin.id);

        const res = await PATCH(req, params);
        expect(res.status).toBe(200);

        const body = await res.json();
        const returned: UserRow = body.data;

        expect(returned.status).toBe("inactive");

        const inStore = store.get(admin.id);
        expect(inStore?.status).toBe("inactive");
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 18.4**
   *
   * Reactivation: for any inactive admin account, after PATCH action="activate",
   * the returned status is 'active' — access is restored.
   */
  it("always sets status to active when activating an inactive admin account", async () => {
    await fc.assert(
      fc.asyncProperty(inactiveAdminArb, async (admin) => {
        resetStores([admin]);

        const req = buildPatchRequest({ action: "activate" });
        const params = buildRouteParams(admin.id);

        const res = await PATCH(req, params);
        expect(res.status).toBe(200);

        const body = await res.json();
        const returned: UserRow = body.data;

        expect(returned.status).toBe("active");
        expect(returned.status).not.toBe("inactive");

        const inStore = store.get(admin.id);
        expect(inStore?.status).toBe("active");
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 18.4**
   *
   * Conflict guard: activating an already-active admin must return 409.
   * The account record must remain unchanged.
   */
  it("returns 409 and leaves record unchanged when activating an already-active admin", async () => {
    await fc.assert(
      fc.asyncProperty(activeAdminArb, async (admin) => {
        resetStores([admin]);

        const req = buildPatchRequest({ action: "activate" });
        const params = buildRouteParams(admin.id);

        const res = await PATCH(req, params);
        expect(res.status).toBe(409);

        const body = await res.json();
        expect(body.error).toBeDefined();

        // Record must remain active and unchanged
        const inStore = store.get(admin.id);
        expect(inStore?.status).toBe("active");
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 18.4**
   *
   * Round-trip: deactivate then reactivate must restore an active admin account.
   * Transitions: active → inactive → active.
   */
  it("deactivate then activate round-trip restores admin account to active status", async () => {
    await fc.assert(
      fc.asyncProperty(activeAdminArb, async (admin) => {
        resetStores([admin]);

        // Step 1: deactivate
        const deactivateReq = buildPatchRequest({ action: "deactivate" });
        const deactivateRes = await PATCH(deactivateReq, buildRouteParams(admin.id));
        expect(deactivateRes.status).toBe(200);
        const deactivateBody = await deactivateRes.json();
        expect(deactivateBody.data.status).toBe("inactive");
        expect(store.get(admin.id)?.status).toBe("inactive");

        // Step 2: reactivate
        const activateReq = buildPatchRequest({ action: "activate" });
        const activateRes = await PATCH(activateReq, buildRouteParams(admin.id));
        expect(activateRes.status).toBe(200);
        const activateBody = await activateRes.json();
        expect(activateBody.data.status).toBe("active");
        expect(store.get(admin.id)?.status).toBe("active");
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 18.4**
   *
   * Non-admin users (member, super_admin) must not be found via this endpoint —
   * it returns 404 because the route filters by role = 'admin'.
   */
  it("returns 404 for non-admin users (only admin role accounts are managed here)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          id: fc.uuid(),
          full_name: fc.string({ minLength: 1, maxLength: 50 }),
          email: fc.emailAddress(),
          role: fc.constantFrom("member" as const, "super_admin" as const),
          status: fc.constantFrom(...USER_STATUSES),
          contact_number: fc.constant(null),
          created_at: fc.constant("2025-01-01T00:00:00Z"),
          updated_at: fc.constant("2025-01-01T00:00:00Z"),
        }),
        fc.constantFrom("activate" as const, "deactivate" as const),
        async (nonAdminUser, action) => {
          resetStores([nonAdminUser]);

          const req = buildPatchRequest({ action });
          const params = buildRouteParams(nonAdminUser.id);

          const res = await PATCH(req, params);
          expect(res.status).toBe(404);

          const body = await res.json();
          expect(body.error).toBeDefined();

          // The non-admin user record must remain unchanged
          const inStore = store.get(nonAdminUser.id);
          expect(inStore?.status).toBe(nonAdminUser.status);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 18.4**
   *
   * Missing admin: PATCH on a non-existent id must return 404 without
   * modifying any existing records.
   */
  it("returns 404 when the target admin account does not exist", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(anyStatusAdminArb, { minLength: 0, maxLength: 5 }),
        fc.uuid(),
        fc.constantFrom("activate" as const, "deactivate" as const),
        async (existingAdmins, nonExistentId, action) => {
          fc.pre(existingAdmins.every((a) => a.id !== nonExistentId));

          resetStores(existingAdmins);

          const req = buildPatchRequest({ action });
          const params = buildRouteParams(nonExistentId);

          const res = await PATCH(req, params);
          expect(res.status).toBe(404);

          const body = await res.json();
          expect(body.error).toBeDefined();

          // All existing records must remain unchanged
          for (const admin of existingAdmins) {
            expect(store.get(admin.id)?.status).toBe(admin.status);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 18.4**
   *
   * Invalid action values must return 400, leaving the store unchanged.
   */
  it("returns 400 for invalid action values and leaves store unchanged", async () => {
    await fc.assert(
      fc.asyncProperty(
        anyStatusAdminArb,
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => s !== "activate" && s !== "deactivate"),
        async (admin, invalidAction) => {
          resetStores([admin]);

          const originalStatus = admin.status;
          const req = buildPatchRequest({ action: invalidAction });
          const params = buildRouteParams(admin.id);

          const res = await PATCH(req, params);
          expect(res.status).toBe(400);

          const body = await res.json();
          expect(body.error).toBeDefined();

          // Store must remain unchanged
          expect(store.get(admin.id)?.status).toBe(originalStatus);
        }
      ),
      { numRuns: 50 }
    );
  });
});
