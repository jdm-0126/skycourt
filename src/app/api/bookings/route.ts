import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"] & {
  courts: { name: string } | null;
};

/**
 * GET /api/bookings
 *
 * Returns the authenticated member's own bookings split into upcoming and
 * past lists. RLS on the `bookings` table ensures only the owner's rows
 * are returned even if the server-side query does not filter by member_id
 * explicitly — but we also order results predictably.
 *
 * Response shape:
 *   { upcoming: Booking[], past: Booking[] }
 *
 * Where each Booking row is joined with courts(name).
 *
 * Returns:
 *   200 — { upcoming, past }
 *   401 — no valid session
 *   500 — database error
 *
 * Requirements: 8.1, 8.2
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
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
  // 2. Fetch bookings for the authenticated member
  //    RLS already restricts rows to `member_id = auth.uid()`, but we also
  //    pass the filter explicitly to make the intent clear.
  // -------------------------------------------------------------------------
  const { data, error: queryError } = await supabase
    .from("bookings")
    .select("*, courts(name)")
    .eq("member_id", user.id)
    .order("booking_date", { ascending: false })
    .order("start_time", { ascending: false });

  if (queryError) {
    return NextResponse.json(
      { error: "Failed to fetch bookings" },
      { status: 500 }
    );
  }

  // Cast to our local BookingRow type which includes the courts join.
  const bookings = (data ?? []) as BookingRow[];

  // -------------------------------------------------------------------------
  // 3. Split into upcoming and past based on today's date (server-side)
  // -------------------------------------------------------------------------
  const todayStr = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

  const upcoming = bookings.filter(
    (b) => b.booking_date >= todayStr && b.status !== "cancelled"
  );
  const past = bookings.filter(
    (b) => b.booking_date < todayStr || b.status === "cancelled"
  );

  return NextResponse.json({ upcoming, past });
}
