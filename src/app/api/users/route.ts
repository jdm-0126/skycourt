import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/users
 *
 * Returns all users with role = 'member'.
 * Requires `admin` or `super_admin` role.
 *
 * Response shape:
 *   { data: UserRow[], count: number }
 *
 * Returns:
 *   200 — { data, count }
 *   401 — no valid session
 *   403 — authenticated user does not hold admin or super_admin role
 *   500 — database error
 *
 * Requirements: 17.1, 17.2
 */
export async function GET(): Promise<NextResponse> {
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
  // 2. Authorise — must be admin or super_admin
  // -------------------------------------------------------------------------
  const role =
    (user.app_metadata?.role as string | undefined) ??
    (user.user_metadata?.role as string | undefined);

  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // -------------------------------------------------------------------------
  // 3. Fetch all members via admin client (bypasses RLS)
  // -------------------------------------------------------------------------
  const adminClient = createAdminClient();

  const { data, error: queryError } = await adminClient
    .from("users")
    .select("id, full_name, email, role, status, contact_number, created_at, updated_at")
    .eq("role", "member")
    .order("created_at", { ascending: false });

  if (queryError) {
    console.error("[GET /api/users] Query failed:", queryError.message);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }

  const users = data ?? [];

  return NextResponse.json({ data: users, count: users.length });
}
