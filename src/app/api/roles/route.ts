import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/roles
 *
 * Returns all roles with their associated permissions.
 * Requires `super_admin` role.
 *
 * Returns:
 *   200 — { data: Role[] }
 *   401 — no valid session
 *   403 — authenticated user does not hold super_admin role
 *   500 — database error
 *
 * Requirements: 19.1
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  // -------------------------------------------------------------------------
  // 1. Authenticate via server client (reads session cookie)
  // -------------------------------------------------------------------------
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // -------------------------------------------------------------------------
  // 2. Authorise — must be super_admin only
  // -------------------------------------------------------------------------
  const role =
    (user.app_metadata?.role as string | undefined) ??
    (user.user_metadata?.role as string | undefined);

  if (role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // -------------------------------------------------------------------------
  // 3. Fetch all roles from the database
  // -------------------------------------------------------------------------
  const adminClient = createAdminClient();

  const { data: roles, error: fetchError } = await adminClient
    .from("roles")
    .select("id, name, permissions, updated_at")
    .order("name", { ascending: true });

  if (fetchError) {
    console.error("[GET /api/roles] DB fetch failed:", fetchError.message);
    return NextResponse.json(
      { error: "Failed to fetch roles. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: roles }, { status: 200 });
}
