import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dashboardForRole } from "@/lib/auth/dashboard-redirect";

/**
 * GET /api/auth/callback
 *
 * Handles the Supabase PKCE OAuth / email-verification callback.
 * Exchanges the `code` query parameter for a user session, then
 * redirects directly to the role-appropriate dashboard so the user
 * lands on their home screen without having to log in again.
 *
 * Requirements: 4.7, 5.2
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (error || !data.session) {
        // Exchange failed — redirect to login with an error hint
        return NextResponse.redirect(
          `${origin}/auth/login?error=auth-error`
        );
      }

      // Derive role from session metadata
      const user = data.session.user;
      const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;
      const userMeta = (user.user_metadata ?? {}) as Record<string, unknown>;

      // Try to get the authoritative role from the users table first
      let destination: string | null = null;

      const { data: userRow } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();

      const dbRole = (userRow as { role?: string } | null)?.role;
      if (dbRole) {
        destination = dashboardForRole({ role: dbRole }, {});
      }

      // Fall back to JWT metadata if DB query failed or returned no role
      if (!destination || destination === "/") {
        destination = dashboardForRole(appMeta, userMeta);
      }

      // If we still have no role (e.g. brand-new member whose DB row isn't
      // populated yet), go to the member dashboard as a safe default
      if (!destination || destination === "/") {
        destination = "/member/dashboard";
      }

      // Successful exchange — redirect directly to the user's dashboard
      return NextResponse.redirect(`${origin}${destination}`);
    } catch {
      // Unexpected server error
      return NextResponse.redirect(`${origin}/auth/login?error=auth-error`);
    }
  }

  // No code present in the URL — redirect to login with an error hint
  return NextResponse.redirect(`${origin}/auth/login?error=auth-error`);
}
