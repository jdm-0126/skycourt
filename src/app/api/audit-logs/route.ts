import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/audit-logs
 *
 * Returns audit log entries with optional filtering.
 * Requires `super_admin` role.
 *
 * Query parameters (all optional):
 *   startDate  — created_at >= startDate  (ISO 8601 / YYYY-MM-DD)
 *   endDate    — created_at <= endDate    (ISO 8601 / YYYY-MM-DD)
 *   userId     — exact match on user_id
 *   actionType — exact match on action_type
 *
 * Response shape:
 *   { data: AuditLogEntry[], count: number }
 *
 * Returns:
 *   200 — { data, count }
 *   401 — no valid session
 *   403 — authenticated user does not hold super_admin role
 *   500 — database error
 *
 * Requirements: 20.1, 20.2, 20.3
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
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
  // 2. Authorise — must be super_admin
  // -------------------------------------------------------------------------
  const role =
    (user.app_metadata?.role as string | undefined) ??
    (user.user_metadata?.role as string | undefined);

  if (role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // -------------------------------------------------------------------------
  // 3. Parse query parameters
  // -------------------------------------------------------------------------
  const { searchParams } = request.nextUrl;
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const userId = searchParams.get("userId");
  const actionType = searchParams.get("actionType");

  // -------------------------------------------------------------------------
  // 4. Build query using the admin client so RLS is bypassed
  //    Join with users table to get name and email for display
  // -------------------------------------------------------------------------
  const adminClient = createAdminClient();

  let query = adminClient
    .from("audit_logs")
    .select("*, users(full_name, email)")
    .order("created_at", { ascending: false });

  // Apply server-side filters
  if (startDate) {
    // Include the full start day by using >= the start of that day
    query = query.gte("created_at", `${startDate}T00:00:00.000Z`);
  }
  if (endDate) {
    // Include the full end day by using <= the end of that day
    query = query.lte("created_at", `${endDate}T23:59:59.999Z`);
  }
  if (userId) {
    query = query.eq("user_id", userId);
  }
  if (actionType) {
    query = query.eq("action_type", actionType);
  }

  const { data, error: queryError } = await query;

  if (queryError) {
    console.error("[AuditLogs] Query failed:", queryError.message);
    return NextResponse.json(
      { error: "Failed to fetch audit logs" },
      { status: 500 }
    );
  }

  const entries = data ?? [];

  return NextResponse.json({ data: entries, count: entries.length });
}
