import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/auth/callback
 *
 * Handles the Supabase PKCE OAuth / email-verification callback.
 * Exchanges the `code` query parameter for a user session, then
 * redirects to the login page so the user can sign in with their
 * newly-verified credentials.
 *
 * Requirements: 4.7
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        // Exchange failed — redirect to login with an error hint
        return NextResponse.redirect(
          `${origin}/auth/login?error=auth-error`
        );
      }

      // Successful exchange — redirect to login so the user can sign in
      return NextResponse.redirect(`${origin}/auth/login`);
    } catch {
      // Unexpected server error
      return NextResponse.redirect(`${origin}/auth/login?error=auth-error`);
    }
  }

  // No code present in the URL — redirect to login with an error hint
  return NextResponse.redirect(`${origin}/auth/login?error=auth-error`);
}
