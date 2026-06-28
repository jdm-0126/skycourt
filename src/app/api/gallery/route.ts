import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Supabase Storage bucket for gallery images */
const GALLERY_BUCKET = "gallery";

/** Max file size: 5 MB */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/** Accepted MIME types */
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// ---------------------------------------------------------------------------
// GET /api/gallery
//
// Returns all gallery images ordered by display_order ASC. Public access —
// no authentication required.
//
// Response shape:
//   { images: GalleryImage[] }
//
// Returns:
//   200 — { images }
//   500 — database error
//
// Requirements: 14.1
// ---------------------------------------------------------------------------

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("gallery_images")
    .select("*")
    .order("display_order", { ascending: true });

  if (error) {
    console.error("[Gallery GET] Failed to fetch images:", error.message);
    return NextResponse.json(
      { error: "Failed to fetch gallery images" },
      { status: 500 }
    );
  }

  return NextResponse.json({ images: data ?? [] });
}

// ---------------------------------------------------------------------------
// POST /api/gallery
//
// Uploads a file to Supabase Storage and inserts a gallery_images record.
// Requires admin or super_admin role.
//
// Body: multipart/form-data with a `file` field.
//
// Error codes (in JSON body):
//   FILE_TOO_LARGE   — file exceeds 5 MB
//   UNSUPPORTED_TYPE — MIME type is not accepted
//
// Returns:
//   201 — { image: GalleryImage }
//   400 — FILE_TOO_LARGE | UNSUPPORTED_TYPE | missing file
//   401 — no valid session
//   403 — insufficient role
//   500 — storage or database error
//
// Requirements: 14.2
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
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
  // 3. Parse multipart form data
  // -------------------------------------------------------------------------
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json(
      { error: "No file provided", code: "MISSING_FILE" },
      { status: 400 }
    );
  }

  // -------------------------------------------------------------------------
  // 4. Validate file type and size
  // -------------------------------------------------------------------------
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File exceeds 5 MB limit", code: "FILE_TOO_LARGE" },
      { status: 400 }
    );
  }

  if (!ACCEPTED_TYPES.includes(file.type)) {
    return NextResponse.json(
      {
        error: "Unsupported file type. Accepted: JPEG, PNG, WebP, GIF",
        code: "UNSUPPORTED_TYPE",
      },
      { status: 400 }
    );
  }

  // -------------------------------------------------------------------------
  // 5. Generate unique storage path and upload file
  // -------------------------------------------------------------------------
  const ext = file.type.split("/")[1] ?? "jpg";
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const storagePath = `${fileName}`;

  const adminClient = createAdminClient();

  // Ensure bucket exists (creates it if missing)
  const { error: bucketError } = await adminClient.storage.createBucket(
    GALLERY_BUCKET,
    { public: true }
  );
  // Ignore "already exists" errors
  if (bucketError && !bucketError.message.includes("already exists")) {
    console.error("[Gallery POST] Bucket creation error:", bucketError.message);
    // Non-fatal: bucket may already exist with a different error message variant
  }

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await adminClient.storage
    .from(GALLERY_BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("[Gallery POST] Storage upload error:", uploadError.message);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 }
    );
  }

  // -------------------------------------------------------------------------
  // 6. Build public URL
  // -------------------------------------------------------------------------
  const {
    data: { publicUrl },
  } = adminClient.storage.from(GALLERY_BUCKET).getPublicUrl(storagePath);

  // -------------------------------------------------------------------------
  // 7. Determine next display_order
  // -------------------------------------------------------------------------
  const { data: lastImage } = await adminClient
    .from("gallery_images")
    .select("display_order")
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = lastImage ? lastImage.display_order + 1 : 0;

  // -------------------------------------------------------------------------
  // 8. Insert gallery_images record
  // -------------------------------------------------------------------------
  const { data: image, error: insertError } = await adminClient
    .from("gallery_images")
    .insert({
      storage_path: storagePath,
      public_url: publicUrl,
      display_order: nextOrder,
      uploaded_by: user.id,
    })
    .select()
    .single();

  if (insertError || !image) {
    // Clean up the uploaded file on DB failure
    await adminClient.storage.from(GALLERY_BUCKET).remove([storagePath]);
    console.error("[Gallery POST] DB insert error:", insertError?.message);
    return NextResponse.json(
      { error: "Failed to save image record" },
      { status: 500 }
    );
  }

  return NextResponse.json({ image }, { status: 201 });
}
