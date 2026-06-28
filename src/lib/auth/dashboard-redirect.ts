/**
 * dashboard-redirect.ts
 *
 * Pure helper that resolves the role stored in Supabase session metadata
 * to the correct dashboard route.
 *
 * Checks app_metadata first (set server-side / via DB trigger),
 * then user_metadata (set client-side during sign-up) as fallback.
 *
 * Requirements: 5.2
 */

export type AppRole = "member" | "admin" | "super_admin";

/**
 * Given the session's app_metadata and user_metadata objects, return the
 * dashboard path appropriate for the user's role.
 *
 * - admin | super_admin → /admin/dashboard
 * - member             → /member/dashboard
 * - anything else      → / (fallback)
 */
export function dashboardForRole(
  appMeta: Record<string, unknown>,
  userMeta: Record<string, unknown>
): string {
  const role =
    (appMeta?.role as string | undefined) ??
    (userMeta?.role as string | undefined);

  if (role === "admin" || role === "super_admin") {
    return "/admin/dashboard";
  }
  if (role === "member") {
    return "/member/dashboard";
  }
  // Fallback — unknown or missing role
  return "/";
}
