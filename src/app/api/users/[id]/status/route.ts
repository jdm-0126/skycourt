import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * PATCH /api/users/:id/status
 *
 * Activates or deactivates a member account.
 * Requires `admin` or `super_admin` role.
 *
 * Request body:
 *   { action: "activate" | "deactivate" }
 *
 * Behaviour:
 *   - deactivate: sets status to 'inactive'; works regardless of current status
 *   - activate:   sets status to 'active'; if already 'active', returns 409
 *
 * Returns:
 *   200 — { data: updatedUser }
 *   400 — missing or invalid action
 *   401 — no valid session
 *   403 — authenticated user does not hold admin or super_admin role
 *   404 — user not found
 *   409 — account is already active (activate action only)
 *   500 — database error
 *
 * Requirements: 17.1, 17.2, 17.3
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  // -------------------------------------------------------------------------
  // 1. Resolve path param
  // -------------------------------------------------------------------------
  const { id } = await params;

  // -------------------------------------------------------------------------
  // 2. Authenticate via server client (reads session cookie)
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
  // 3. Authorise — must be admin or super_admin
  // -------------------------------------------------------------------------
  const role =
    (user.app_metadata?.role as string | undefined) ??
    (user.user_metadata?.role as string | undefined);

  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // -------------------------------------------------------------------------
  // 4. Parse and validate request body
  // -------------------------------------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const action = (body as Record<string, unknown>)?.action;

  if (action !== "activate" && action !== "deactivate") {
    return NextResponse.json(
      { error: 'Invalid action. Must be "activate" or "deactivate".' },
      { status: 400 }
    );
  }

  // -------------------------------------------------------------------------
  // 5. Fetch current user record to check existence and current status
  // -------------------------------------------------------------------------
  const adminClient = createAdminClient();

  const { data: targetUser, error: fetchError } = await adminClient
    .from("users")
    .select("id, status")
    .eq("id", id)
    .single();

  if (fetchError || !targetUser) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  // -------------------------------------------------------------------------
  // 6. Guard: activating an already-active account is a conflict
  // -------------------------------------------------------------------------
  if (action === "activate" && targetUser.status === "active") {
    return NextResponse.json(
      { error: "Account is already active" },
      { status: 409 }
    );
  }

  // -------------------------------------------------------------------------
  // 7. Apply the status change
  // -------------------------------------------------------------------------
  const newStatus = action === "activate" ? "active" : "inactive";

  const { data: updatedUser, error: updateError } = await adminClient
    .from("users")
    .update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    console.error(
      "[PATCH /api/users/:id/status] Update failed:",
      updateError.message
    );
    return NextResponse.json(
      { error: "Failed to update user status. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: updatedUser }, { status: 200 });
}
