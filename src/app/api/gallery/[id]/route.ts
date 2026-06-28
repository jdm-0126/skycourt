import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const GALLERY_BUCKET = "gallery";

type RouteParams = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// DELETE /api/gallery/:id
//
// Removes the image file from Supabase Storage and deletes the DB record.
// Requires admin or super_admin role.
//
// Returns:
//   200 — { success: true }
//   401 — no valid session
//   403 — insufficient role
//   404 — image not found
//   500 — storage or database error
//
// Requirements: 14.3
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id } = await params;

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
  // 3. Fetch the record to get the storage_path
  // -------------------------------------------------------------------------
  const { data: image, error: fetchError } = await adminClient
    .from("gallery_images")
    .select("id, storage_path")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    console.error("[Gallery DELETE] Fetch error:", fetchError.message);
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 500 });
  }

  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  // -------------------------------------------------------------------------
  // 4. Remove file from Supabase Storage
  // -------------------------------------------------------------------------
  const { error: storageError } = await adminClient.storage
    .from(GALLERY_BUCKET)
    .remove([image.storage_path]);

  if (storageError) {
    console.error("[Gallery DELETE] Storage remove error:", storageError.message);
    // Non-fatal: the file may already be gone; continue with DB deletion
  }

  // -------------------------------------------------------------------------
  // 5. Delete DB record
  // -------------------------------------------------------------------------
  const { error: deleteError } = await adminClient
    .from("gallery_images")
    .delete()
    .eq("id", id);

  if (deleteError) {
    console.error("[Gallery DELETE] DB delete error:", deleteError.message);
    return NextResponse.json({ error: "Failed to delete image record" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
