/**
 * Property-based tests: Role Permission Management
 *
 * **Validates: Requirements 19.2, 19.3**
 *
 * Property 31: Role Permission Changes Apply to Active Sessions
 *   For any role whose permissions are modified by a super_admin, the updated
 *   permissions must be persisted and returned correctly by GET /api/roles.
 *
 * Property 32: Super Admin Core Permissions Cannot Be Removed
 *   Any attempt to remove or set to false any of the 5 core super_admin
 *   permissions must be rejected with 400.
 *
 * Strategy:
 *   - Mock `@/lib/supabase/server` so auth.getUser returns a super_admin user.
 *   - Mock `@/lib/supabase/admin` with an in-memory roles store supporting
 *     the query patterns used by GET /api/roles and PATCH /api/roles/:id.
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RoleRow = {
  id: string;
  name: string;
  permissions: Record<string, boolean>;
  updated_at: string;
};

type AuditLogRow = {
  user_id: string;
  action_type: string;
  affected_record_id: string;
  metadata: unknown;
};

// ---------------------------------------------------------------------------
// Core permissions constant (mirrors implementation)
// ---------------------------------------------------------------------------

const SUPER_ADMIN_CORE_PERMISSIONS = [
  "manage_admins",
  "manage_roles",
  "view_audit_logs",
  "manage_backups",
  "manage_settings",
] as const;

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

let rolesStore: Map<string, RoleRow>;
let auditLogs: AuditLogRow[];

function resetStores(rows: RoleRow[] = []) {
  rolesStore = new Map(rows.map((r) => [r.id, r]));
  auditLogs = [];
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
// GET /api/roles:
//   adminClient.from("roles").select("id, name, permissions, updated_at").order(...)
//
// PATCH /api/roles/:id:
//   adminClient.from("roles").select("id, name, permissions").eq("id", id).single()
//   adminClient.from("roles").update({...}).eq("id", id).select(...).single()
//   adminClient.from("audit_logs").insert({...})
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => {
    return {
      from: vi.fn((table: string) => {
        // ------------------------------------------------------------------
        // audit_logs table
        // ------------------------------------------------------------------
        if (table === "audit_logs") {
          return {
            insert: vi.fn((entry: AuditLogRow) => {
              auditLogs.push(entry);
              return { error: null };
            }),
          };
        }

        // ------------------------------------------------------------------
        // roles table
        // ------------------------------------------------------------------
        if (table !== "roles") {
          throw new Error(`Unexpected table in admin mock: ${table}`);
        }

        return {
          // ----------------------------------------------------------------
          // GET path: .select(...).order(...)
          // ----------------------------------------------------------------
          select: vi.fn((_cols: string) => ({
            order: vi.fn((_col: string, _opts: unknown) => {
              // Return all roles sorted by name ascending
              const sorted = Array.from(rolesStore.values()).sort((a, b) =>
                a.name.localeCompare(b.name)
              );
              return Promise.resolve({ data: sorted, error: null });
            }),

            // PATCH fetch path: .select(...).eq("id", id).single()
            eq: vi.fn((_col: string, id: string) => ({
              single: vi.fn(async () => {
                const row = rolesStore.get(id) ?? null;
                if (!row) {
                  return {
                    data: null,
                    error: { code: "PGRST116", message: "Row not found" },
                  };
                }
                return { data: row, error: null };
              }),
            })),
          })),

          // ----------------------------------------------------------------
          // PATCH update path: .update({...}).eq("id", id).select(...).single()
          // ----------------------------------------------------------------
          update: vi.fn(
            (patch: Partial<RoleRow>) => ({
              eq: vi.fn((_col: string, id: string) => ({
                select: vi.fn((_cols: string) => ({
                  single: vi.fn(async () => {
                    const existing = rolesStore.get(id);
                    if (!existing) {
                      return {
                        data: null,
                        error: { message: "row not found" },
                      };
                    }
                    const updated: RoleRow = {
                      ...existing,
                      ...patch,
                      permissions:
                        (patch.permissions as Record<string, boolean>) ??
                        existing.permissions,
                    };
                    rolesStore.set(id, updated);
                    return { data: updated, error: null };
                  }),
                })),
              })),
            })
          ),
        };
      }),
    };
  }),
}));

// ---------------------------------------------------------------------------
// Import route handlers AFTER mocks are set up
// ---------------------------------------------------------------------------

import { GET } from "@/app/api/roles/route";
import { PATCH } from "@/app/api/roles/[id]/route";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildGetRequest(): NextRequest {
  return new NextRequest("http://localhost/api/roles", { method: "GET" });
}

function buildPatchRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/roles/test-id", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function buildRouteParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

/** Build a valid full set of super_admin core permissions (all true) */
function corePermissionsAllTrue(): Record<string, boolean> {
  return Object.fromEntries(SUPER_ADMIN_CORE_PERMISSIONS.map((p) => [p, true]));
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Safe permission key: alphanumeric + underscores, non-empty */
const permissionKeyArb = fc
  .stringMatching(/^[a-z][a-z0-9_]{0,29}$/)
  .filter((s) => !SUPER_ADMIN_CORE_PERMISSIONS.includes(s as never));

/** Generates a role name that is NOT super_admin */
const nonSuperAdminRoleNameArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0 && s !== "super_admin");

/** Generates an arbitrary non-empty permissions map with boolean values */
const permissionsMapArb: fc.Arbitrary<Record<string, boolean>> = fc
  .uniqueArray(permissionKeyArb, { minLength: 1, maxLength: 8 })
  .chain((keys) =>
    fc
      .array(fc.boolean(), { minLength: keys.length, maxLength: keys.length })
      .map((vals) => Object.fromEntries(keys.map((k, i) => [k, vals[i]])))
  );

/** Generates a full role row for a non-super_admin role */
const nonSuperAdminRoleArb: fc.Arbitrary<RoleRow> = fc.record({
  id: fc.uuid(),
  name: nonSuperAdminRoleNameArb,
  permissions: permissionsMapArb,
  updated_at: fc.constant("2025-01-01T00:00:00Z"),
});

/** Generates a super_admin role row (with all core permissions = true) */
const superAdminRoleArb: fc.Arbitrary<RoleRow> = fc.record({
  id: fc.uuid(),
  name: fc.constant("super_admin"),
  permissions: fc
    .uniqueArray(permissionKeyArb, { minLength: 0, maxLength: 5 })
    .map((extraKeys) => ({
      ...corePermissionsAllTrue(),
      ...Object.fromEntries(extraKeys.map((k) => [k, true])),
    })),
  updated_at: fc.constant("2025-01-01T00:00:00Z"),
});

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  resetStores();
});

// ===========================================================================
// Property 31: Role Permission Changes Apply to Active Sessions
// ===========================================================================

describe("Property 31: Role Permission Changes Apply to Active Sessions", () => {
  /**
   * **Validates: Requirements 19.2**
   *
   * Core property: for any valid permissions update on a non-super_admin role,
   * the PATCH handler persists the new permissions and GET returns them.
   */
  it("persists updated permissions and GET returns them for any non-super_admin role", async () => {
    await fc.assert(
      fc.asyncProperty(
        nonSuperAdminRoleArb,
        permissionsMapArb,
        async (role, newPermissions) => {
          resetStores([role]);

          // PATCH with new permissions
          const patchReq = buildPatchRequest({ permissions: newPermissions });
          const patchRes = await PATCH(patchReq, buildRouteParams(role.id));
          expect(patchRes.status).toBe(200);

          const patchBody = await patchRes.json();
          expect(patchBody.data).toBeDefined();
          expect(patchBody.data.permissions).toEqual(newPermissions);

          // GET should now return the updated permissions
          const getReq = buildGetRequest();
          const getRes = await GET(getReq);
          expect(getRes.status).toBe(200);

          const getBody = await getRes.json();
          const returnedRole = (getBody.data as RoleRow[]).find(
            (r) => r.id === role.id
          );
          expect(returnedRole).toBeDefined();
          expect(returnedRole?.permissions).toEqual(newPermissions);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 19.2**
   *
   * PATCH response must include the updated permissions — the caller sees the
   * new state immediately (supports active session refresh).
   */
  it("PATCH response body always contains the exact permissions that were submitted", async () => {
    await fc.assert(
      fc.asyncProperty(
        nonSuperAdminRoleArb,
        permissionsMapArb,
        async (role, newPermissions) => {
          resetStores([role]);

          const patchReq = buildPatchRequest({ permissions: newPermissions });
          const patchRes = await PATCH(patchReq, buildRouteParams(role.id));
          expect(patchRes.status).toBe(200);

          const body = await patchRes.json();
          expect(body.data.permissions).toEqual(newPermissions);
          // role identity is preserved
          expect(body.data.id).toBe(role.id);
          expect(body.data.name).toBe(role.name);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 19.2**
   *
   * Multiple sequential updates: each update replaces the previous permissions
   * and GET always reflects the latest state.
   */
  it("sequential permission updates always leave the store in the last-written state", async () => {
    await fc.assert(
      fc.asyncProperty(
        nonSuperAdminRoleArb,
        fc.array(permissionsMapArb, { minLength: 2, maxLength: 5 }),
        async (role, permissionsList) => {
          resetStores([role]);

          let lastPermissions: Record<string, boolean> = role.permissions;

          for (const perms of permissionsList) {
            const patchReq = buildPatchRequest({ permissions: perms });
            const patchRes = await PATCH(patchReq, buildRouteParams(role.id));
            expect(patchRes.status).toBe(200);
            lastPermissions = perms;
          }

          // GET must reflect the final state
          const getReq = buildGetRequest();
          const getRes = await GET(getReq);
          expect(getRes.status).toBe(200);

          const getBody = await getRes.json();
          const returnedRole = (getBody.data as RoleRow[]).find(
            (r) => r.id === role.id
          );
          expect(returnedRole).toBeDefined();
          expect(returnedRole?.permissions).toEqual(lastPermissions);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 19.2**
   *
   * GET /api/roles returns ALL roles in the store, not just a subset.
   */
  it("GET returns all roles present in the store for any set of roles", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(nonSuperAdminRoleArb, {
          minLength: 1,
          maxLength: 6,
          selector: (r) => r.id,
        }),
        async (roles) => {
          resetStores(roles);

          const getReq = buildGetRequest();
          const getRes = await GET(getReq);
          expect(getRes.status).toBe(200);

          const getBody = await getRes.json();
          const returnedIds = (getBody.data as RoleRow[]).map((r) => r.id);

          for (const role of roles) {
            expect(returnedIds).toContain(role.id);
          }
          expect(getBody.data).toHaveLength(roles.length);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 19.2**
   *
   * An audit log entry with action_type 'role_permission_changed' must be
   * written for every successful PATCH.
   */
  it("always writes an audit log entry for every successful permission update", async () => {
    await fc.assert(
      fc.asyncProperty(
        nonSuperAdminRoleArb,
        permissionsMapArb,
        async (role, newPermissions) => {
          resetStores([role]);
          auditLogs = [];

          const patchReq = buildPatchRequest({ permissions: newPermissions });
          const patchRes = await PATCH(patchReq, buildRouteParams(role.id));
          expect(patchRes.status).toBe(200);

          const relevantLogs = auditLogs.filter(
            (l) => l.action_type === "role_permission_changed"
          );
          expect(relevantLogs.length).toBeGreaterThanOrEqual(1);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 19.2**
   *
   * PATCH on a non-existent role id must return 404.
   */
  it("returns 404 when patching a role id that does not exist", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        permissionsMapArb,
        async (nonExistentId, permissions) => {
          resetStores([]); // empty store

          const patchReq = buildPatchRequest({ permissions });
          const patchRes = await PATCH(patchReq, buildRouteParams(nonExistentId));
          expect(patchRes.status).toBe(404);

          const body = await patchRes.json();
          expect(body.error).toBeDefined();
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ===========================================================================
// Property 32: Super Admin Core Permissions Cannot Be Removed
// ===========================================================================

describe("Property 32: Super Admin Core Permissions Cannot Be Removed", () => {
  /**
   * **Validates: Requirements 19.3**
   *
   * Core property: any permissions map that sets ANY core permission to false
   * must be rejected with 400 for the super_admin role.
   */
  it("rejects any permissions map that sets a core super_admin permission to false", async () => {
    await fc.assert(
      fc.asyncProperty(
        superAdminRoleArb,
        // Pick one core permission to set false
        fc.constantFrom(...SUPER_ADMIN_CORE_PERMISSIONS),
        // Optionally add some extra non-core permissions
        fc.uniqueArray(permissionKeyArb, { minLength: 0, maxLength: 4 }),
        async (superAdminRole, corePerm, extraKeys) => {
          resetStores([superAdminRole]);

          // Build a map with all core perms true EXCEPT the chosen one = false
          const invalidPermissions: Record<string, boolean> = {
            ...corePermissionsAllTrue(),
            ...Object.fromEntries(extraKeys.map((k) => [k, true])),
            [corePerm]: false, // violating core permission
          };

          const patchReq = buildPatchRequest({ permissions: invalidPermissions });
          const patchRes = await PATCH(patchReq, buildRouteParams(superAdminRole.id));

          expect(patchRes.status).toBe(400);

          const body = await patchRes.json();
          expect(body.error).toBeDefined();

          // The store must remain unchanged
          const inStore = rolesStore.get(superAdminRole.id);
          expect(inStore?.permissions).toEqual(superAdminRole.permissions);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 19.3**
   *
   * Any permissions map that OMITS any core permission must be rejected with 400.
   */
  it("rejects any permissions map that omits a core super_admin permission", async () => {
    await fc.assert(
      fc.asyncProperty(
        superAdminRoleArb,
        // Pick one core permission to omit
        fc.constantFrom(...SUPER_ADMIN_CORE_PERMISSIONS),
        fc.uniqueArray(permissionKeyArb, { minLength: 0, maxLength: 4 }),
        async (superAdminRole, omittedPerm, extraKeys) => {
          resetStores([superAdminRole]);

          // Build a map with all core perms true EXCEPT the omitted one
          const incompletePermissions: Record<string, boolean> = {
            ...corePermissionsAllTrue(),
            ...Object.fromEntries(extraKeys.map((k) => [k, true])),
          };
          delete incompletePermissions[omittedPerm];

          const patchReq = buildPatchRequest({
            permissions: incompletePermissions,
          });
          const patchRes = await PATCH(patchReq, buildRouteParams(superAdminRole.id));

          expect(patchRes.status).toBe(400);

          const body = await patchRes.json();
          expect(body.error).toBeDefined();

          // The store must remain unchanged
          const inStore = rolesStore.get(superAdminRole.id);
          expect(inStore?.permissions).toEqual(superAdminRole.permissions);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 19.3**
   *
   * All 5 core permissions set to false simultaneously must be rejected with 400.
   */
  it("rejects permissions map with all core super_admin permissions set to false", async () => {
    await fc.assert(
      fc.asyncProperty(
        superAdminRoleArb,
        fc.uniqueArray(permissionKeyArb, { minLength: 0, maxLength: 4 }),
        async (superAdminRole, extraKeys) => {
          resetStores([superAdminRole]);

          // All core perms = false, plus some extras = true
          const allFalsePermissions: Record<string, boolean> = {
            ...Object.fromEntries(
              SUPER_ADMIN_CORE_PERMISSIONS.map((p) => [p, false])
            ),
            ...Object.fromEntries(extraKeys.map((k) => [k, true])),
          };

          const patchReq = buildPatchRequest({ permissions: allFalsePermissions });
          const patchRes = await PATCH(patchReq, buildRouteParams(superAdminRole.id));

          expect(patchRes.status).toBe(400);

          const body = await patchRes.json();
          expect(body.error).toBeDefined();

          // Store must remain unchanged
          const inStore = rolesStore.get(superAdminRole.id);
          expect(inStore?.permissions).toEqual(superAdminRole.permissions);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 19.3**
   *
   * A valid update that keeps ALL core permissions = true must succeed with 200.
   * Non-core permissions can be freely changed.
   */
  it("accepts any permissions map that includes all core super_admin permissions as true", async () => {
    await fc.assert(
      fc.asyncProperty(
        superAdminRoleArb,
        // Extra non-core permissions with arbitrary boolean values
        fc.uniqueArray(permissionKeyArb, { minLength: 0, maxLength: 5 }),
        fc.array(fc.boolean(), { minLength: 0, maxLength: 5 }),
        async (superAdminRole, extraKeys, extraVals) => {
          resetStores([superAdminRole]);

          // Ensure arrays are same length
          const len = Math.min(extraKeys.length, extraVals.length);
          const slicedKeys = extraKeys.slice(0, len);
          const slicedVals = extraVals.slice(0, len);

          const validPermissions: Record<string, boolean> = {
            ...corePermissionsAllTrue(),
            ...Object.fromEntries(slicedKeys.map((k, i) => [k, slicedVals[i]])),
          };

          const patchReq = buildPatchRequest({ permissions: validPermissions });
          const patchRes = await PATCH(patchReq, buildRouteParams(superAdminRole.id));

          expect(patchRes.status).toBe(200);

          const body = await patchRes.json();
          expect(body.data).toBeDefined();
          expect(body.data.permissions).toEqual(validPermissions);

          // Core permissions must still be true in the stored result
          const inStore = rolesStore.get(superAdminRole.id);
          for (const corePerm of SUPER_ADMIN_CORE_PERMISSIONS) {
            expect(inStore?.permissions[corePerm]).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 19.3**
   *
   * Non-super_admin roles should NOT be subject to the core permission guard —
   * any permissions map (including one where "manage_admins" etc. are false)
   * must succeed with 200 for a non-super_admin role.
   */
  it("accepts any permissions map for non-super_admin roles even if core permission names appear as false", async () => {
    await fc.assert(
      fc.asyncProperty(
        nonSuperAdminRoleArb,
        // Generate permissions that include some core names set to false
        fc.constantFrom(...SUPER_ADMIN_CORE_PERMISSIONS),
        fc.uniqueArray(permissionKeyArb, { minLength: 0, maxLength: 3 }),
        async (role, corePermName, extraKeys) => {
          resetStores([role]);

          const permissionsWithCoreFalse: Record<string, boolean> = {
            ...Object.fromEntries(extraKeys.map((k) => [k, true])),
            [corePermName]: false,
          };

          const patchReq = buildPatchRequest({
            permissions: permissionsWithCoreFalse,
          });
          const patchRes = await PATCH(patchReq, buildRouteParams(role.id));

          // Must succeed — guard only applies to super_admin role
          expect(patchRes.status).toBe(200);

          const body = await patchRes.json();
          expect(body.data.permissions).toEqual(permissionsWithCoreFalse);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 19.3**
   *
   * Guard must apply for EACH of the 5 core permissions individually —
   * there is no subset of core permissions that bypasses the guard.
   */
  it("rejects requests for every individual core permission being set to false", async () => {
    await fc.assert(
      fc.asyncProperty(superAdminRoleArb, async (superAdminRole) => {
        for (const corePerm of SUPER_ADMIN_CORE_PERMISSIONS) {
          resetStores([superAdminRole]);

          const invalidPermissions: Record<string, boolean> = {
            ...corePermissionsAllTrue(),
            [corePerm]: false,
          };

          const patchReq = buildPatchRequest({ permissions: invalidPermissions });
          const patchRes = await PATCH(patchReq, buildRouteParams(superAdminRole.id));

          expect(patchRes.status).toBe(400);
        }
      }),
      { numRuns: 30 }
    );
  });

  /**
   * **Validates: Requirements 19.3**
   *
   * An empty permissions map ({}) must be rejected for super_admin since all
   * core permissions would be omitted.
   */
  it("rejects an empty permissions map for super_admin role", async () => {
    await fc.assert(
      fc.asyncProperty(superAdminRoleArb, async (superAdminRole) => {
        resetStores([superAdminRole]);

        const patchReq = buildPatchRequest({ permissions: {} });
        const patchRes = await PATCH(patchReq, buildRouteParams(superAdminRole.id));

        expect(patchRes.status).toBe(400);

        const body = await patchRes.json();
        expect(body.error).toBeDefined();

        // Store remains unchanged
        const inStore = rolesStore.get(superAdminRole.id);
        expect(inStore?.permissions).toEqual(superAdminRole.permissions);
      }),
      { numRuns: 30 }
    );
  });
});
