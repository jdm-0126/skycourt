import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { contentSchema } from "@/lib/validation/content";
import type { Json } from "@/lib/supabase/types";

type RouteParams = { params: Promise<{ section: string }> };

/**
 * GET /api/content/:section
 *
 * Public endpoint — returns the JSONB content row for the given section.
 * Returns null (with 200) if no row exists yet for that section.
 *
 * Requirements: 13.1
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { section } = await params;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("website_content")
    .select("*")
    .eq("section", section)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch content" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data });
}

/**
 * PATCH /api/content/:section
 *
 * Admin-only endpoint — validates the body with `contentSchema`, then
 * upserts the website_content row for the section.
 *
 * Returns:
 *  200 — updated record
 *  400 — validation error
 *  401 — not authenticated
 *  403 — authenticated but not admin / super_admin
 *  500 — database error
 *
 * Requirements: 13.2
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { section } = await params;

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
  // 3. Parse and validate request body
  // -------------------------------------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Merge the section from the URL path into the body so contentSchema
  // can validate the section field together with the content field.
  const parseResult = contentSchema.safeParse({ section, ...(body as object) });

  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Validation error", details: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const { content } = parseResult.data;
  // Cast to the Supabase Json type — contentSchema guarantees the shape is
  // a plain object with string keys, which is a valid Json value.
  const contentJson = content as unknown as Json;

  // -------------------------------------------------------------------------
  // 4. Upsert using the admin client (bypasses RLS)
  // -------------------------------------------------------------------------
  const adminClient = createAdminClient();

  const { data, error: upsertError } = await adminClient
    .from("website_content")
    .upsert(
      {
        section,
        content: contentJson,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "section" }
    )
    .select()
    .single();

  if (upsertError) {
    return NextResponse.json(
      { error: "Failed to update content" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data });
}
