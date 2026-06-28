import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/users/admin
 *
 * Creates a new admin account.
 * Requires `super_admin` role.
 *
 * Request body:
 *   { name: string, email: string, password: string }
 *
 * Behaviour:
 *   - Creates a Supabase Auth user with email_confirm: true
 *   - Inserts a row into the users table with role = 'admin'
 *   - Writes an audit log entry
 *
 * Returns:
 *   201 — { data: createdUser }
 *   400 — missing or invalid fields
 *   401 — no valid session
 *   403 — authenticated user does not hold super_admin role
 *   409 — email already exists
 *   500 — database or auth error
 *
 * Requirements: 18.1, 18.2, 18.3, 18.4
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
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
  // 3. Parse and validate request body
  // -------------------------------------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { name, email, password } = (body as Record<string, unknown>) ?? {};

  if (!name || typeof name !== "string" || name.trim() === "") {
    return NextResponse.json(
      { error: "Field 'name' is required and must be a non-empty string." },
      { status: 400 }
    );
  }

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json(
      { error: "Field 'email' is required and must be a valid email address." },
      { status: 400 }
    );
  }

  if (!password || typeof password !== "string" || password.length < 8) {
    return NextResponse.json(
      { error: "Field 'password' is required and must be at least 8 characters." },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();

  // -------------------------------------------------------------------------
  // 4. Create the Supabase Auth user (email pre-confirmed)
  // -------------------------------------------------------------------------
  const { data: authData, error: createAuthError } =
    await adminClient.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: {
        full_name: name.trim(),
        role: "admin",
      },
    });

  if (createAuthError) {
    // Supabase returns a message containing "already registered" on duplicate email
    if (
      createAuthError.message.toLowerCase().includes("already registered") ||
      createAuthError.message.toLowerCase().includes("already exists")
    ) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }
    console.error(
      "[POST /api/users/admin] Auth user creation failed:",
      createAuthError.message
    );
    return NextResponse.json(
      { error: "Failed to create admin account. Please try again." },
      { status: 500 }
    );
  }

  const newAuthUserId = authData.user.id;

  // -------------------------------------------------------------------------
  // 5. Insert the users table row with role = 'admin'
  // -------------------------------------------------------------------------
  const { data: newUser, error: insertError } = await adminClient
    .from("users")
    .insert({
      id: newAuthUserId,
      full_name: name.trim(),
      email: email.trim().toLowerCase(),
      role: "admin",
      status: "active",
    })
    .select()
    .single();

  if (insertError) {
    // Attempt to clean up the orphaned Auth user to keep state consistent
    await adminClient.auth.admin.deleteUser(newAuthUserId);

    console.error(
      "[POST /api/users/admin] DB insert failed:",
      insertError.message
    );
    return NextResponse.json(
      { error: "Failed to save admin account. Please try again." },
      { status: 500 }
    );
  }

  // -------------------------------------------------------------------------
  // 6. Write audit log
  // -------------------------------------------------------------------------
  const { error: auditError } = await adminClient.from("audit_logs").insert({
    user_id: user.id,
    action_type: "admin_account_created",
    affected_record_id: newAuthUserId,
    metadata: {
      created_by: user.id,
      new_admin_email: email.trim().toLowerCase(),
      new_admin_name: name.trim(),
    },
  });

  if (auditError) {
    // Audit failure is non-fatal — log but do not roll back
    console.error(
      "[POST /api/users/admin] Audit log insert failed:",
      auditError.message
    );
  }

  return NextResponse.json({ data: newUser }, { status: 201 });
}
