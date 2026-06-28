import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { courtSchema } from "@/lib/validation/court";

/**
 * GET /api/courts
 *
 * Returns all courts with their unavailable dates. Public access — no
 * authentication required. Uses the anon client so RLS applies normally.
 *
 * Response shape:
 *   { courts: Court[] }
 *
 * Returns:
 *   200 — { courts }
 *   500 — database error
 *
 * Requirements: 12.1
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("courts")
    .select("*, court_unavailable_dates(*)")
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch courts" },
      { status: 500 }
    );
  }

  return NextResponse.json({ courts: data ?? [] });
}

/**
 * POST /api/courts
 *
 * Creates a new court. Requires admin or super_admin role.
 *
 * Body shape (validated by courtSchema):
 *   { name, operatingHours, status? }
 *
 * Steps:
 *   1. Authenticate — 401 if no session
 *   2. Authorise — role must be admin or super_admin → 403 if not
 *   3. Parse and validate body — 400 for invalid input
 *   4. Insert court record via admin client (bypasses RLS)
 *   5. Return 201 with the created court
 *
 * Returns:
 *   201 — { court }
 *   400 — validation error
 *   401 — no valid session
 *   403 — insufficient role
 *   500 — database error
 *
 * Requirements: 12.2
 */
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
  // 3. Parse and validate request body
  // -------------------------------------------------------------------------
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = courtSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { name, operatingHours, status } = parsed.data;

  // -------------------------------------------------------------------------
  // 4. Insert court record via admin client
  // -------------------------------------------------------------------------
  const adminClient = createAdminClient();

  const { data: court, error: insertError } = await adminClient
    .from("courts")
    .insert({
      name,
      operating_hours: operatingHours as unknown as import("@/lib/supabase/types").Json,
      status: status ?? "available",
    })
    .select()
    .single();

  if (insertError || !court) {
    return NextResponse.json(
      { error: "Failed to create court" },
      { status: 500 }
    );
  }

  return NextResponse.json({ court }, { status: 201 });
}
