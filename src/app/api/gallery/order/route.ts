import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// PATCH /api/gallery/order
//
// Rewrites all display_order values for the supplied set of image IDs.
// The body contains an ordered array of image IDs; the server assigns
// display_order 0, 1, 2, … based on array position.
//
// Body shape:
//   { orderedIds: string[] }
//
// Returns:
//   200 — { success: true }
//   400 — missing or invalid orderedIds array
//   401 — no valid session
//   403 — insufficient role
//   500 — database error
//
// Requirements: 14.4
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest): Promise<NextResponse> {
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

  // -------------------------------------------------------------------------
  // 3. Parse and validate body
  // -------------------------------------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { orderedIds } = body as { orderedIds?: unknown };

  if (
    !Array.isArray(orderedIds) ||
    orderedIds.length === 0 ||
    orderedIds.some((id) => typeof id !== "string")
  ) {
    return NextResponse.json(
      { error: "orderedIds must be a non-empty array of strings" },
      { status: 400 }
    );
  }

  // -------------------------------------------------------------------------
  // 4. Apply all display_order updates
  //
  // Supabase JS does not support multi-row upsert with different values per
  // row in a single statement, so we run individual updates. For a gallery
  // feature the number of images is small and this is acceptable.
  // -------------------------------------------------------------------------
  const adminClient = createAdminClient();

  const updates = (orderedIds as string[]).map((id, index) =>
    adminClient
      .from("gallery_images")
      .update({ display_order: index })
      .eq("id", id)
  );

  const results = await Promise.all(updates);

  const firstError = results.find((r) => r.error);
  if (firstError?.error) {
    console.error("[Gallery PATCH order] Update error:", firstError.error.message);
    return NextResponse.json(
      { error: "Failed to update display order" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
