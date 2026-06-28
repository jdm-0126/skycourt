import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

/**
 * Core permissions that must never be removed from the super_admin role.
 * Removing any of these would cause a system lockout.
 */
const SUPER_ADMIN_CORE_PERMISSIONS = [
  "manage_admins",
  "manage_roles",
  "view_audit_logs",
  "manage_backups",
  "manage_settings",
] as const;

/**
 * PATCH /api/roles/:id
 *
 * Updates the permissions for the specified role.
 * Requires `super_admin` role.
 *
 * Request body:
 *   { permissions: Record<string, boolean> }
 *
 * Behaviour:
 *   - If the role being updated is `super_admin`, core permissions MUST NOT
 *     be set to false or omitted from the permissions map.
 *   - Writes an audit log entry with action_type 'role_permission_changed'.
 *
 * Returns:
 *   200 — { data: updatedRole }
 *   400 — invalid body or attempt to remove core super_admin permissions
 *   401 — no valid session
 *   403 — authenticated user does not hold super_admin role
 *   404 — role not found
 *   500 — database error
 *
 * Requirements: 19.2, 19.3
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;

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
  const callerRole =
    (user.app_metadata?.role as string | undefined) ??
    (user.user_metadata?.role as string | undefined);

  if (callerRole !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // -------------------------------------------------------------------------
  // 3. Parse and validate request body
  // -------------------------------------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { permissions } = (body as Record<string, unknown>) ?? {};

  if (
    !permissions ||
    typeof permissions !== "object" ||
    Array.isArray(permissions)
  ) {
    return NextResponse.json(
      {
        error:
          "Field 'permissions' is required and must be a Record<string, boolean>.",
      },
      { status: 400 }
    );
  }

  // Verify all values in permissions are booleans
  const permissionsMap = permissions as Record<string, unknown>;
  for (const [key, value] of Object.entries(permissionsMap)) {
    if (typeof value !== "boolean") {
      return NextResponse.json(
        {
          error: `Permission value for '${key}' must be a boolean.`,
        },
        { status: 400 }
      );
    }
  }

  const typedPermissions = permissionsMap as Record<string, boolean>;

  const adminClient = createAdminClient();

  // -------------------------------------------------------------------------
  // 4. Fetch the target role to check its name
  // -------------------------------------------------------------------------
  const { data: targetRole, error: fetchError } = await adminClient
    .from("roles")
    .select("id, name, permissions")
    .eq("id", id)
    .single();

  if (fetchError || !targetRole) {
    if (fetchError?.code === "PGRST116") {
      return NextResponse.json({ error: "Role not found." }, { status: 404 });
    }
    console.error(
      "[PATCH /api/roles/:id] DB fetch failed:",
      fetchError?.message
    );
    return NextResponse.json(
      { error: "Failed to fetch role. Please try again." },
      { status: 500 }
    );
  }

  // -------------------------------------------------------------------------
  // 5. Guard against removing core super_admin permissions
  // -------------------------------------------------------------------------
  if (targetRole.name === "super_admin") {
    for (const corePermission of SUPER_ADMIN_CORE_PERMISSIONS) {
      if (typedPermissions[corePermission] === false || !(corePermission in typedPermissions)) {
        return NextResponse.json(
          { error: "Cannot remove core super_admin permissions" },
          { status: 400 }
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // 6. Update the role permissions
  // -------------------------------------------------------------------------
  const { data: updatedRole, error: updateError } = await adminClient
    .from("roles")
    .update({
      permissions: typedPermissions as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, name, permissions, updated_at")
    .single();

  if (updateError || !updatedRole) {
    console.error(
      "[PATCH /api/roles/:id] DB update failed:",
      updateError?.message
    );
    return NextResponse.json(
      { error: "Failed to update role permissions. Please try again." },
      { status: 500 }
    );
  }

  // -------------------------------------------------------------------------
  // 7. Write audit log
  // -------------------------------------------------------------------------
  const { error: auditError } = await adminClient.from("audit_logs").insert({
    user_id: user.id,
    action_type: "role_permission_changed",
    affected_record_id: id,
    metadata: {
      updated_by: user.id,
      role_name: targetRole.name,
      previous_permissions: targetRole.permissions,
      new_permissions: typedPermissions,
    },
  });

  if (auditError) {
    // Audit failure is non-fatal — log but do not roll back
    console.error(
      "[PATCH /api/roles/:id] Audit log insert failed:",
      auditError.message
    );
  }

  return NextResponse.json({ data: updatedRole }, { status: 200 });
}
