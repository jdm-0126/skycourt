/**
 * Property-based tests: Maintenance Mode Controls Public Access
 *
 * **Validates: Requirements 22.2, 22.3**
 *
 * Property 36: Maintenance Mode Controls Public Access
 *   For any super_admin who enables maintenance mode, all subsequent requests
 *   to public pages from guests and members must receive the maintenance
 *   message. After disabling maintenance mode, all public pages must be
 *   immediately accessible without the maintenance message.
 *
 *   Since maintenance mode is enforced at the page/layout level (NOT in
 *   edge middleware), this test validates the settings API (PATCH and GET)
 *   that controls the maintenance_mode flag persisted in system_settings.
 *
 * The serialisation pipeline under test:
 *   Input:   boolean (true | false)
 *   Stored:  string  "true" | "false"  in DB row
 *   Output:  boolean (re-coerced via `=== "true"`)
 *
 * Strategy:
 *   - Mock `@/lib/supabase/server` so auth.getUser returns a super_admin.
 *   - Mock `@/lib/supabase/admin` with a chainable builder that:
 *       • Captures every `.upsert()` call on system_settings.
 *       • Serves a configurable in-memory settings store for `.select()`.
 *   - Generate arbitrary boolean values via fast-check and assert that:
 *       1. PATCH always stores "true"/"false" strings (not raw booleans).
 *       2. GET always coerces "true"/"false" strings back to booleans.
 *       3. Round-trip: PATCH(x) → in-memory store → GET response returns x.
 *       4. Other settings alongside maintenance_mode do not corrupt its value.
 *       5. Non-super_admin callers receive 401/403 and cannot change the flag.
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// In-memory settings store — simulates the system_settings DB table
// ---------------------------------------------------------------------------

type SettingsStore = Record<string, string>;

/** Mutable in-memory DB for the current test run. */
let inMemorySettings: SettingsStore;

/** Captured upsert payloads from each PATCH call. */
let capturedUpserts: Array<{ key: string; value: string; updated_at: string }[]>;

function resetStore(initial: SettingsStore = {}) {
  inMemorySettings = {
    site_name: "Sky Court",
    contact_email: "info@skycourt.com",
    maintenance_mode: "false",
    ...initial,
  };
  capturedUpserts = [];
}

// ---------------------------------------------------------------------------
// Mock @/lib/supabase/server — returns a super_admin by default
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
// Mock @/lib/supabase/admin — chainable builder backed by inMemorySettings
//
// The PATCH /api/settings route performs:
//   1. adminClient.from("system_settings").upsert([...], { onConflict:"key" })
//      → applies each { key, value } to inMemorySettings
//   2. adminClient.from("system_settings").select("id,key,value,updated_at").order(...)
//      → returns rows from inMemorySettings
//
// The GET /api/settings route performs only step 2.
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "system_settings") {
        return {
          // PATCH uses: .upsert(rows, { onConflict: "key" })
          upsert: vi.fn(
            (
              rows: { key: string; value: string; updated_at: string }[],
              _opts: unknown
            ) => {
              // Capture for assertions
              capturedUpserts.push(rows);
              // Apply to in-memory store
              for (const row of rows) {
                inMemorySettings[row.key] = row.value;
              }
              return Promise.resolve({ error: null });
            }
          ),

          // Both GET and PATCH use: .select(...).order(...)
          select: vi.fn(() => ({
            order: vi.fn(() => {
              const rows = Object.entries(inMemorySettings).map(
                ([key, value]) => ({
                  id: `id-${key}`,
                  key,
                  value,
                  updated_at: new Date().toISOString(),
                })
              );
              return Promise.resolve({ data: rows, error: null });
            }),
          })),
        };
      }

      // Fallback for any other table (shouldn't be reached)
      return {
        select: vi.fn(() => Promise.resolve({ data: [], error: null })),
        upsert: vi.fn(() => Promise.resolve({ error: null })),
      };
    }),
  })),
}));

// ---------------------------------------------------------------------------
// Import route handlers AFTER mocks are in place
// ---------------------------------------------------------------------------

import { GET, PATCH } from "@/app/api/settings/route";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildPatchRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function buildGetRequest(): NextRequest {
  return new NextRequest("http://localhost/api/settings", { method: "GET" });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
});

// ===========================================================================
// Property 36: Maintenance Mode Controls Public Access
// ===========================================================================

describe("Property 36: Maintenance Mode Controls Public Access", () => {
  // -------------------------------------------------------------------------
  // 36.1  Boolean → string serialisation in DB
  //        PATCH must store "true" or "false" (not raw booleans) in the DB.
  // -------------------------------------------------------------------------
  it("PATCH stores maintenance_mode as string 'true' or 'false', never as a boolean", async () => {
    /**
     * **Validates: Requirements 22.2, 22.3**
     */
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (mode) => {
        resetStore();

        const req = buildPatchRequest({ maintenance_mode: mode });
        const res = await PATCH(req as never);

        expect(res.status).toBe(200);
        expect(capturedUpserts).toHaveLength(1);

        const upsertedRows = capturedUpserts[0];
        const maintenanceRow = upsertedRows.find(
          (r) => r.key === "maintenance_mode"
        );

        // Row must exist and value must be a string
        expect(maintenanceRow).toBeDefined();
        expect(typeof maintenanceRow!.value).toBe("string");

        // Must be exactly "true" or "false" — never the boolean itself
        expect(["true", "false"]).toContain(maintenanceRow!.value);
        expect(maintenanceRow!.value).toBe(mode ? "true" : "false");
      }),
      { numRuns: 50 }
    );
  });

  // -------------------------------------------------------------------------
  // 36.2  String → boolean coercion on GET
  //        GET must coerce "true"/"false" DB strings back to JS booleans.
  // -------------------------------------------------------------------------
  it("GET coerces 'true'/'false' DB strings back to JS booleans in the response", async () => {
    /**
     * **Validates: Requirements 22.2, 22.3**
     */
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (storedMode) => {
        // Seed the in-memory store with the raw string value (as it would be
        // stored in the real DB after a PATCH)
        resetStore({ maintenance_mode: storedMode ? "true" : "false" });

        const req = buildGetRequest();
        const res = await GET(req as never);

        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.data).toBeDefined();

        // maintenance_mode in the response must be a boolean, not a string
        const { maintenance_mode } = body.data as { maintenance_mode: unknown };
        expect(typeof maintenance_mode).toBe("boolean");
        expect(maintenance_mode).toBe(storedMode);
      }),
      { numRuns: 50 }
    );
  });

  // -------------------------------------------------------------------------
  // 36.3  Full round-trip: PATCH(x) → GET returns x
  //        Enabling/disabling maintenance mode is immediately reflected in
  //        the settings returned by GET — no stale values.
  // -------------------------------------------------------------------------
  it("PATCH(maintenance_mode) round-trip: GET immediately returns the new value", async () => {
    /**
     * **Validates: Requirements 22.2, 22.3**
     */
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (mode) => {
        resetStore();

        // Enable or disable maintenance mode
        const patchReq = buildPatchRequest({ maintenance_mode: mode });
        const patchRes = await PATCH(patchReq as never);
        expect(patchRes.status).toBe(200);

        // PATCH response body must already contain the updated boolean
        const patchBody = await patchRes.json();
        expect(patchBody.data.maintenance_mode).toBe(mode);

        // Independent GET must also return the updated value
        const getReq = buildGetRequest();
        const getRes = await GET(getReq as never);
        expect(getRes.status).toBe(200);

        const getBody = await getRes.json();
        expect(getBody.data.maintenance_mode).toBe(mode);
      }),
      { numRuns: 50 }
    );
  });

  // -------------------------------------------------------------------------
  // 36.4  Toggle stability: enable then disable restores false
  //        Requirement 22.3 — disabling must immediately clear the flag.
  // -------------------------------------------------------------------------
  it("disabling maintenance mode after enabling always restores it to false", async () => {
    /**
     * **Validates: Requirements 22.3**
     */
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 20 }),
        async (_seed) => {
          resetStore({ maintenance_mode: "false" });

          // Step 1: enable
          const enableReq = buildPatchRequest({ maintenance_mode: true });
          const enableRes = await PATCH(enableReq as never);
          expect(enableRes.status).toBe(200);
          const enableBody = await enableRes.json();
          expect(enableBody.data.maintenance_mode).toBe(true);

          // Step 2: disable
          const disableReq = buildPatchRequest({ maintenance_mode: false });
          const disableRes = await PATCH(disableReq as never);
          expect(disableRes.status).toBe(200);
          const disableBody = await disableRes.json();
          expect(disableBody.data.maintenance_mode).toBe(false);

          // Step 3: confirm via GET
          const getReq = buildGetRequest();
          const getRes = await GET(getReq as never);
          const getBody = await getRes.json();
          expect(getBody.data.maintenance_mode).toBe(false);
        }
      ),
      { numRuns: 30 }
    );
  });

  // -------------------------------------------------------------------------
  // 36.5  Other settings alongside maintenance_mode preserve its value
  //        Patching site_name or contact_email together with maintenance_mode
  //        must not corrupt the maintenance_mode value.
  // -------------------------------------------------------------------------
  it("patching other settings alongside maintenance_mode does not corrupt maintenance_mode", async () => {
    /**
     * **Validates: Requirements 22.2, 22.3**
     */
    const siteNameArb = fc
      .string({ minLength: 1, maxLength: 50 })
      .filter((s) => s.trim().length > 0);

    const emailArb = fc
      .tuple(
        fc.stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")), {
          minLength: 3,
          maxLength: 10,
        }),
        fc.stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")), {
          minLength: 2,
          maxLength: 8,
        })
      )
      .map(([local, domain]) => `${local}@${domain}.com`);

    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        siteNameArb,
        emailArb,
        async (mode, siteName, email) => {
          resetStore();

          const req = buildPatchRequest({
            maintenance_mode: mode,
            site_name: siteName,
            contact_email: email,
          });
          const res = await PATCH(req as never);
          expect(res.status).toBe(200);

          const body = await res.json();

          // maintenance_mode must be what we set, unaffected by other fields
          expect(body.data.maintenance_mode).toBe(mode);

          // Other settings must also be correctly stored
          expect(body.data.site_name).toBe(siteName);
          expect(body.data.contact_email).toBe(email);
        }
      ),
      { numRuns: 50 }
    );
  });

  // -------------------------------------------------------------------------
  // 36.6  Upserted value is never a raw boolean in the DB row
  //        Belt-and-suspenders: the typeof check on the stored string.
  // -------------------------------------------------------------------------
  it("the value written to system_settings for maintenance_mode is always a string, never a raw boolean", async () => {
    /**
     * **Validates: Requirements 22.2, 22.3**
     */
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (mode) => {
        resetStore();

        const req = buildPatchRequest({ maintenance_mode: mode });
        await PATCH(req as never);

        // What ended up in the in-memory store must be a string
        const storedValue = inMemorySettings["maintenance_mode"];
        expect(typeof storedValue).toBe("string");
        expect(storedValue === "true" || storedValue === "false").toBe(true);
        expect(storedValue).not.toBe(true as unknown as string);
        expect(storedValue).not.toBe(false as unknown as string);
      }),
      { numRuns: 50 }
    );
  });
});

// ===========================================================================
// Authorization: non-super_admin users cannot toggle maintenance mode
// ===========================================================================

describe("Authorization: maintenance mode PATCH requires super_admin", () => {
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

    const req = buildPatchRequest({ maintenance_mode: true });
    const res = await PATCH(req as never);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 403 when a guest attempts to enable maintenance mode", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: {
              id: "guest-user-id",
              app_metadata: {},
              user_metadata: {},
            },
          },
          error: null,
        })),
      },
    } as never);

    const req = buildPatchRequest({ maintenance_mode: true });
    const res = await PATCH(req as never);
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 403 when a member attempts to enable maintenance mode", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: {
              id: "member-user-id",
              app_metadata: { role: "member" },
              user_metadata: {},
            },
          },
          error: null,
        })),
      },
    } as never);

    const req = buildPatchRequest({ maintenance_mode: true });
    const res = await PATCH(req as never);
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 403 when an admin (not super_admin) attempts to enable maintenance mode", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValueOnce({
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
    } as never);

    const req = buildPatchRequest({ maintenance_mode: true });
    const res = await PATCH(req as never);
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("property: any non-super_admin role cannot change maintenance_mode", async () => {
    /**
     * **Validates: Requirements 22.2, 22.3**
     *
     * For any role that is not 'super_admin', PATCH /api/settings must
     * return 401 or 403 and must NOT modify the maintenance_mode flag.
     */
    const nonSuperAdminRole = fc.oneof(
      fc.constant(null),                  // no role (guest)
      fc.constant("member"),
      fc.constant("admin"),
      fc.constant("viewer"),
      fc
        .string({ minLength: 1, maxLength: 20 })
        .filter((s) => s !== "super_admin")
    );

    await fc.assert(
      fc.asyncProperty(nonSuperAdminRole, fc.boolean(), async (role, mode) => {
        resetStore({ maintenance_mode: "false" });

        const { createClient } = await import("@/lib/supabase/server");
        vi.mocked(createClient).mockResolvedValueOnce({
          auth: {
            getUser: vi.fn(async () => ({
              data: {
                user: role
                  ? {
                      id: "non-admin-user-id",
                      app_metadata: { role },
                      user_metadata: {},
                    }
                  : null,
              },
              error: role ? null : { message: "No session" },
            })),
          },
        } as never);

        const req = buildPatchRequest({ maintenance_mode: mode });
        const res = await PATCH(req as never);

        // Must be rejected (401 or 403)
        expect([401, 403]).toContain(res.status);

        // In-memory store must remain unchanged
        expect(inMemorySettings["maintenance_mode"]).toBe("false");
      }),
      { numRuns: 50 }
    );
  });

  it("returns 401 when there is no authenticated session for GET", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
          error: { message: "No session" },
        })),
      },
    } as never);

    const req = buildGetRequest();
    const res = await GET(req as never);
    expect(res.status).toBe(401);
  });

  it("returns 403 when an admin (not super_admin) attempts to read settings", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValueOnce({
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
    } as never);

    const req = buildGetRequest();
    const res = await GET(req as never);
    expect(res.status).toBe(403);
  });
});
