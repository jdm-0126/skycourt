import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * PATCH /api/users/:id/admin-status
 *
 * Deactivates or reactivates an admin account.
 * Requires `super_admin` role.
 *
 * Request body:
 *   { action: "activate" | "deactivate" }
 *
 * Behaviour:
 *   - deactivate: sets status to 'inactive'; middleware blocks subsequent
 *     requests for that user on their next request
 *   - activate:   sets status to 'active'; returns 409 if already active
 *   - Both actions write an audit log entry
 *
 * Returns:
 *   200 — { data: updatedUser }
 *   400 — missing or invalid action
 *   401 — no valid session
 *   403 — authenticated user does not hold super_admin role
 *   404 — user not found or is not an admin account
 *   409 — account is already active (activate action only)
 *   500 — database error
 *
 * Requirements: 18.1, 18.2, 18.3, 18.4
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
  // 3. Authorise — must be super_admin only
  // -------------------------------------------------------------------------
  const role =
    (user.app_metadata?.role as string | undefined) ??
    (user.user_metadata?.role as string | undefined);

  if (role !== "super_admin") {
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
  // 5. Fetch the target user — must exist and be an admin account
  // -------------------------------------------------------------------------
  const adminClient = createAdminClient();

  const { data: targetUser, error: fetchError } = await adminClient
    .from("users")
    .select("id, role, status, email, full_name")
    .eq("id", id)
    .eq("role", "admin")
    .single();

  if (fetchError || !targetUser) {
    return NextResponse.json(
      { error: "Admin account not found." },
      { status: 404 }
    );
  }

  // -------------------------------------------------------------------------
  // 6. Guard: activating an already-active account is a conflict
  // -------------------------------------------------------------------------
  if (action === "activate" && targetUser.status === "active") {
    return NextResponse.json(
      { error: "Account is already active." },
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
      "[PATCH /api/users/:id/admin-status] Update failed:",
      updateError.message
    );
    return NextResponse.json(
      { error: "Failed to update admin status. Please try again." },
      { status: 500 }
    );
  }

  // -------------------------------------------------------------------------
  // 8. Write audit log
  // -------------------------------------------------------------------------
  const auditActionType =
    action === "deactivate" ? "admin_account_deactivated" : "admin_account_activated";

  const { error: auditError } = await adminClient.from("audit_logs").insert({
    user_id: user.id,
    action_type: auditActionType,
    affected_record_id: id,
    metadata: {
      performed_by: user.id,
      affected_admin_id: id,
      affected_admin_email: targetUser.email,
      previous_status: targetUser.status,
      new_status: newStatus,
    },
  });

  if (auditError) {
    // Audit failure is non-fatal — log but do not roll back
    console.error(
      "[PATCH /api/users/:id/admin-status] Audit log insert failed:",
      auditError.message
    );
  }

  return NextResponse.json({ data: updatedUser }, { status: 200 });
}
