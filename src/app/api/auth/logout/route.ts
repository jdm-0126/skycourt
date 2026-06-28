import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/auth/logout
 *
 * Signs the current user out, writes a `user_logout` audit log entry
 * (best-effort — failure does NOT block the logout), and redirects to
 * the home page.
 *
 * Requirements: 5.9, 20.1
 */
export async function POST(request: NextRequest) {
  const { origin } = new URL(request.url);
  const supabase = await createClient();

  // Capture the current user before invalidating the session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userId = user?.id ?? null;

  // Invalidate the Supabase session
  await supabase.auth.signOut();

  // Write audit log — fire-and-forget; must not block the redirect
  if (userId) {
    try {
      const adminClient = createAdminClient();
      await adminClient.from("audit_logs").insert({
        user_id: userId,
        action_type: "user_logout",
        affected_record_id: userId,
        metadata: {},
      });
    } catch {
      // Audit log failure is non-fatal — the user is already signed out
    }
  }

  return NextResponse.redirect(`${origin}/`);
}
