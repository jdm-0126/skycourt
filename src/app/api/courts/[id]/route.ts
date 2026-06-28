import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

type RouteParams = { params: Promise<{ id: string }> };

/** Shape of the PATCH request body for updating a court */
interface PatchCourtBody {
  name?: string;
  operatingHours?: Record<string, { open: string; close: string }>;
  status?: "available" | "unavailable";
}

/**
 * PATCH /api/courts/:id
 *
 * Updates a court's name, operating hours, or status. Requires admin or
 * super_admin role.
 *
 * Body shape (all fields optional — at least one required):
 *   { name?, operatingHours?, status? }
 *
 * Steps:
 *   1. Authenticate — 401 if no session
 *   2. Authorise — role must be admin or super_admin → 403 if not
 *   3. Verify the court exists — 404 if not found
 *   4. Parse and validate body — 400 for malformed input
 *   5. Apply update via admin client (bypasses RLS)
 *   6. Return 200 with the updated court
 *
 * Returns:
 *   200 — { court }
 *   400 — invalid body or no updatable fields provided
 *   401 — no valid session
 *   403 — insufficient role
 *   404 — court not found
 *   500 — database error
 *
 * Requirements: 12.3
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id: courtId } = await params;

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
  // 3. Verify the court exists
  // -------------------------------------------------------------------------
  const { data: existingCourt, error: fetchError } = await adminClient
    .from("courts")
    .select("id")
    .eq("id", courtId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json(
      { error: "Failed to fetch court" },
      { status: 500 }
    );
  }

  if (!existingCourt) {
    return NextResponse.json({ error: "Court not found" }, { status: 404 });
  }

  // -------------------------------------------------------------------------
  // 4. Parse request body
  // -------------------------------------------------------------------------
  let body: PatchCourtBody;
  try {
    body = (await request.json()) as PatchCourtBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, operatingHours, status } = body;

  // Build update payload — only include fields that were provided
  const updatePayload: {
    name?: string;
    operating_hours?: Json;
    status?: "available" | "unavailable";
    updated_at: string;
  } = { updated_at: new Date().toISOString() };

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim() === "") {
      return NextResponse.json(
        { error: "name must be a non-empty string" },
        { status: 400 }
      );
    }
    updatePayload.name = name.trim();
  }

  if (operatingHours !== undefined) {
    updatePayload.operating_hours = operatingHours as unknown as Json;
  }

  if (status !== undefined) {
    if (status !== "available" && status !== "unavailable") {
      return NextResponse.json(
        { error: "status must be 'available' or 'unavailable'" },
        { status: 400 }
      );
    }
    updatePayload.status = status;
  }

  // Require at least one real field beyond the timestamp
  const hasUpdate =
    updatePayload.name !== undefined ||
    updatePayload.operating_hours !== undefined ||
    updatePayload.status !== undefined;

  if (!hasUpdate) {
    return NextResponse.json(
      { error: "At least one of name, operatingHours, or status must be provided" },
      { status: 400 }
    );
  }

  // -------------------------------------------------------------------------
  // 5. Apply update via admin client
  // -------------------------------------------------------------------------
  const { data: court, error: updateError } = await adminClient
    .from("courts")
    .update(updatePayload)
    .eq("id", courtId)
    .select()
    .single();

  if (updateError || !court) {
    return NextResponse.json(
      { error: "Failed to update court" },
      { status: 500 }
    );
  }

  return NextResponse.json({ court });
}
