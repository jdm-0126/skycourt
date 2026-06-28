import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { profileSchema } from "@/lib/validation/profile";

/**
 * PATCH /api/users/:id/profile
 *
 * Allows an authenticated member to update their own profile (full name,
 * contact number). Uses the admin client to bypass RLS for the update.
 *
 * Auth flow:
 *   1. Authenticate via supabase.auth.getUser() → 401 if not authenticated
 *   2. Authorise: session user.id must match the :id param → 403 if mismatch
 *   3. Validate request body with profileSchema → 400 on validation error
 *   4. Update users row via admin client; return updated row → 200
 *
 * Requirements: 9.2
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // -------------------------------------------------------------------------
  // 1. Resolve path param
  // -------------------------------------------------------------------------
  const { id } = await params;

  // -------------------------------------------------------------------------
  // 2. Authenticate
  // -------------------------------------------------------------------------
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Unauthorised — please log in." },
      { status: 401 }
    );
  }

  // -------------------------------------------------------------------------
  // 3. Authorise — the session user must be updating their own profile
  // -------------------------------------------------------------------------
  if (user.id !== id) {
    return NextResponse.json(
      { error: "Forbidden — you can only update your own profile." },
      { status: 403 }
    );
  }

  // -------------------------------------------------------------------------
  // 4. Parse and validate request body
  // -------------------------------------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const parseResult = profileSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Validation failed.", details: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const { fullName, contactNumber } = parseResult.data;

  // -------------------------------------------------------------------------
  // 5. Update users record via admin client (bypasses RLS)
  // -------------------------------------------------------------------------
  const adminClient = createAdminClient();

  const { data: updatedUser, error: updateError } = await adminClient
    .from("users")
    .update({
      full_name: fullName,
      contact_number: contactNumber !== "" ? contactNumber : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    console.error("[PATCH /api/users/:id/profile] Update failed:", updateError.message);
    return NextResponse.json(
      { error: "Failed to update profile. Please try again." },
      { status: 500 }
    );
  }

  // -------------------------------------------------------------------------
  // 6. Return updated user row
  // -------------------------------------------------------------------------
  return NextResponse.json(updatedUser, { status: 200 });
}
