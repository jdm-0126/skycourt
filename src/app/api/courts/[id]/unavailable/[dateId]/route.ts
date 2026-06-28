import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteParams = { params: Promise<{ id: string; dateId: string }> };

/**
 * DELETE /api/courts/:id/unavailable/:dateId
 *
 * Removes an unavailable date from a court. Requires admin or super_admin role.
 *
 * Steps:
 *   1. Authenticate — 401 if no session
 *   2. Authorise — role must be admin or super_admin → 403 if not
 *   3. Verify the record exists and belongs to the given court — 404 if not found
 *   4. Delete the record via admin client (bypasses RLS)
 *   5. Return 200 { success: true }
 *
 * Returns:
 *   200 — { success: true }
 *   401 — no valid session
 *   403 — insufficient role
 *   404 — record not found (or doesn't belong to this court)
 *   500 — database error
 *
 * Requirements: 12.5
 */
export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id: courtId, dateId } = await params;

  // -------------------------------------------------------------------------
  // 1. Authenticate
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
  // 2. Authorise — admin or super_admin only
  // -------------------------------------------------------------------------
  const role =
    (user.app_metadata?.role as string | undefined) ??
    (user.user_metadata?.role as string | undefined);

  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminClient = createAdminClient();

  // -------------------------------------------------------------------------
  // 3. Verify the record exists and belongs to the given court
  // -------------------------------------------------------------------------
  const { data: existingRecord, error: fetchError } = await adminClient
    .from("court_unavailable_dates")
    .select("id")
    .eq("id", dateId)
    .eq("court_id", courtId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json(
      { error: "Failed to fetch unavailable date record" },
      { status: 500 }
    );
  }

  if (!existingRecord) {
    return NextResponse.json(
      { error: "Unavailable date record not found" },
      { status: 404 }
    );
  }

  // -------------------------------------------------------------------------
  // 4. Delete the record via admin client
  // -------------------------------------------------------------------------
  const { error: deleteError } = await adminClient
    .from("court_unavailable_dates")
    .delete()
    .eq("id", dateId)
    .eq("court_id", courtId);

  if (deleteError) {
    return NextResponse.json(
      { error: "Failed to delete unavailable date" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
