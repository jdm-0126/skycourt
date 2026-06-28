/**
 * Property 6: Login Redirects to Role-Appropriate Dashboard
 *
 * For any authenticated user with role R ∈ {member, admin, super_admin},
 * a successful login must redirect to the dashboard route designated for R:
 *   - member      → /member/dashboard
 *   - admin       → /admin/dashboard
 *   - super_admin → /admin/dashboard
 *
 * Also verifies that any unrecognised or absent role falls back to '/'.
 *
 * Validates: Requirements 5.2
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { dashboardForRole } from "@/lib/auth/dashboard-redirect";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build appMeta with the given role. */
const appMetaWith = (role: string): Record<string, unknown> => ({ role });

/** Empty metadata object (role absent). */
const emptyMeta: Record<string, unknown> = {};

// ---------------------------------------------------------------------------
// Property 6a — valid roles resolve to the correct path (via app_metadata)
// ---------------------------------------------------------------------------
describe("Property 6: Login Redirects to Role-Appropriate Dashboard", () => {
  it("resolves member → /member/dashboard (via app_metadata)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("member" as const),
        (role) => {
          const result = dashboardForRole(appMetaWith(role), emptyMeta);
          return result === "/member/dashboard";
        }
      )
    );
  });

  it("resolves admin → /admin/dashboard (via app_metadata)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("admin" as const),
        (role) => {
          const result = dashboardForRole(appMetaWith(role), emptyMeta);
          return result === "/admin/dashboard";
        }
      )
    );
  });

  it("resolves super_admin → /admin/dashboard (via app_metadata)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("super_admin" as const),
        (role) => {
          const result = dashboardForRole(appMetaWith(role), emptyMeta);
          return result === "/admin/dashboard";
        }
      )
    );
  });

  // Combined — all three valid roles
  it("all valid roles map to the correct dashboard path (via app_metadata)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("member", "admin", "super_admin"),
        (role) => {
          const expected =
            role === "member" ? "/member/dashboard" : "/admin/dashboard";
          const result = dashboardForRole(appMetaWith(role), emptyMeta);
          return result === expected;
        }
      )
    );
  });

  // ---------------------------------------------------------------------------
  // Property 6b — role falls back to user_metadata when app_metadata lacks it
  // ---------------------------------------------------------------------------
  it("falls back to user_metadata when app_metadata has no role", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("member", "admin", "super_admin"),
        (role) => {
          const expected =
            role === "member" ? "/member/dashboard" : "/admin/dashboard";
          // app_metadata has no role key; user_metadata carries the role
          const result = dashboardForRole(emptyMeta, { role });
          return result === expected;
        }
      )
    );
  });

  // app_metadata role takes precedence over user_metadata role
  it("app_metadata role takes precedence over user_metadata role", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("member", "admin", "super_admin"),
        fc.constantFrom("member", "admin", "super_admin"),
        (appRole, userRole) => {
          const expected =
            appRole === "member" ? "/member/dashboard" : "/admin/dashboard";
          const result = dashboardForRole(
            appMetaWith(appRole),
            { role: userRole }
          );
          return result === expected;
        }
      )
    );
  });

  // ---------------------------------------------------------------------------
  // Property 6c — unknown / absent role falls back to '/'
  // ---------------------------------------------------------------------------
  it("returns '/' for any string that is not a recognised role", () => {
    // Generate arbitrary strings that are NOT one of the three known roles
    const unknownRole = fc
      .string()
      .filter((s) => s !== "member" && s !== "admin" && s !== "super_admin");

    fc.assert(
      fc.property(unknownRole, (role) => {
        const result = dashboardForRole({ role }, emptyMeta);
        return result === "/";
      })
    );
  });

  it("returns '/' when both app_metadata and user_metadata have no role", () => {
    fc.assert(
      fc.property(
        fc.record({ foo: fc.string() }),   // arbitrary object without a 'role' key
        fc.record({ bar: fc.integer() }),
        (appMeta, userMeta) => {
          const result = dashboardForRole(
            appMeta as Record<string, unknown>,
            userMeta as Record<string, unknown>
          );
          return result === "/";
        }
      )
    );
  });

  it("returns '/' when role is explicitly undefined", () => {
    const result = dashboardForRole(
      { role: undefined },
      { role: undefined }
    );
    expect(result).toBe("/");
  });
});
