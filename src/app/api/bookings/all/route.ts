import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"] & {
  courts: { name: string } | null;
  users: { full_name: string; email: string } | null;
};

/**
 * GET /api/bookings/all
 *
 * Returns all bookings across all members with optional filtering.
 * Requires `admin` or `super_admin` role.
 *
 * Query parameters (all optional):
 *   dateFrom    — booking_date >= dateFrom  (YYYY-MM-DD)
 *   dateTo      — booking_date <= dateTo    (YYYY-MM-DD)
 *   courtId     — exact match on court_id
 *   memberName  — case-insensitive partial match on users.full_name (post-query)
 *   status      — exact match on booking status
 *
 * Response shape:
 *   { data: BookingRow[], count: number }
 *
 * Returns:
 *   200 — { data, count }
 *   401 — no valid session
 *   403 — authenticated user does not hold admin or super_admin role
 *   500 — database error
 *
 * Requirements: 11.1, 11.5
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
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
  // 2. Authorise — must be admin or super_admin
  // -------------------------------------------------------------------------
  const role =
    (user.app_metadata?.role as string | undefined) ??
    (user.user_metadata?.role as string | undefined);

  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // -------------------------------------------------------------------------
  // 3. Parse query parameters
  // -------------------------------------------------------------------------
  const { searchParams } = request.nextUrl;
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const courtId = searchParams.get("courtId");
  const memberName = searchParams.get("memberName");
  const status = searchParams.get("status");

  // -------------------------------------------------------------------------
  // 4. Build query using the admin client so RLS is bypassed and all
  //    members' bookings are visible.
  // -------------------------------------------------------------------------
  const adminClient = createAdminClient();

  let query = adminClient
    .from("bookings")
    .select("*, courts(name), users(full_name, email)")
    .order("booking_date", { ascending: false })
    .order("start_time", { ascending: false });

  // Apply server-side filters supported by PostgREST directly
  if (dateFrom) {
    query = query.gte("booking_date", dateFrom);
  }
  if (dateTo) {
    query = query.lte("booking_date", dateTo);
  }
  if (courtId) {
    query = query.eq("court_id", courtId);
  }
  if (status) {
    query = query.eq(
      "status",
      status as Database["public"]["Tables"]["bookings"]["Row"]["status"]
    );
  }

  const { data, error: queryError } = await query;

  if (queryError) {
    return NextResponse.json(
      { error: "Failed to fetch bookings" },
      { status: 500 }
    );
  }

  // -------------------------------------------------------------------------
  // 5. Post-query filter for memberName
  //    Supabase PostgREST does not support filtering on embedded/joined
  //    resources (e.g. users.full_name), so we filter in JavaScript.
  // -------------------------------------------------------------------------
  let bookings = (data ?? []) as BookingRow[];

  if (memberName) {
    const needle = memberName.toLowerCase();
    bookings = bookings.filter((b) =>
      b.users?.full_name?.toLowerCase().includes(needle)
    );
  }

  return NextResponse.json({ data: bookings, count: bookings.length });
}
