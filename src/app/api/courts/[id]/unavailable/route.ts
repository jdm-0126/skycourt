import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteParams = { params: Promise<{ id: string }> };

/** Matches YYYY-MM-DD date strings */
const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

/** Shape of the POST request body for adding an unavailable date */
interface AddUnavailableDateBody {
  unavailableDate: string;
  reason?: string;
}

/**
 * POST /api/courts/:id/unavailable
 *
 * Adds an unavailable date to a court. Requires admin or super_admin role.
 *
 * Body shape:
 *   { unavailableDate: string (YYYY-MM-DD), reason?: string }
 *
 * Steps:
 *   1. Authenticate — 401 if no session
 *   2. Authorise — role must be admin or super_admin → 403 if not
 *   3. Verify the court exists — 404 if not found
 *   4. Parse and validate body — 400 for invalid input
 *   5. Insert unavailable date record via admin client (bypasses RLS)
 *   6. Return 201 with the created record
 *
 * Returns:
 *   201 — { unavailableDate }
 *   400 — validation error
 *   401 — no valid session
 *   403 — insufficient role
 *   404 — court not found
 *   409 — that date is already marked unavailable for this court
 *   500 — database error
 *
 * Requirements: 12.4
 */
export async function POST(
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
  // 4. Parse and validate request body
  // -------------------------------------------------------------------------
  let body: AddUnavailableDateBody;
  try {
    body = (await request.json()) as AddUnavailableDateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { unavailableDate, reason } = body;

  if (!unavailableDate || !isoDateRegex.test(unavailableDate)) {
    return NextResponse.json(
      { error: "unavailableDate must be a valid date in YYYY-MM-DD format" },
      { status: 400 }
    );
  }

  // -------------------------------------------------------------------------
  // 5. Insert the unavailable date record via admin client
  // -------------------------------------------------------------------------
  const { data: record, error: insertError } = await adminClient
    .from("court_unavailable_dates")
    .insert({
      court_id: courtId,
      unavailable_date: unavailableDate,
      reason: reason ?? null,
    })
    .select()
    .single();

  if (insertError) {
    // Unique constraint violation — date already marked unavailable
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "This date is already marked as unavailable for this court" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Failed to add unavailable date" },
      { status: 500 }
    );
  }

  return NextResponse.json({ unavailableDate: record }, { status: 201 });
}
