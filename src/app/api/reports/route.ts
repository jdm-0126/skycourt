import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Range = "daily" | "weekly" | "monthly";

interface BookingPerCourt {
  courtName: string;
  count: number;
}

interface PeakHour {
  hour: number;
  count: number;
}

interface ReportMetrics {
  range: Range;
  totalBookings: number;
  bookingsPerCourt: BookingPerCourt[];
  peakHours: PeakHour[];
  cancelledCount: number;
  newMemberRegistrations: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns an ISO date string (YYYY-MM-DD) for the start of the range. */
function getRangeStart(range: Range): string {
  const now = new Date();
  if (range === "daily") {
    // today at midnight UTC
    return now.toISOString().slice(0, 10);
  }
  if (range === "weekly") {
    // 7 days ago
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  }
  // monthly — 30 days ago
  const d = new Date(now);
  d.setDate(d.getDate() - 29);
  return d.toISOString().slice(0, 10);
}

/** Returns today's ISO date string (YYYY-MM-DD). */
function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * GET /api/reports
 *
 * Returns aggregated metrics for the specified time range.
 * Requires `admin` or `super_admin` role.
 *
 * Query parameters:
 *   range — "daily" | "weekly" | "monthly"  (required)
 *
 * Response shape:
 *   {
 *     range,
 *     totalBookings,
 *     bookingsPerCourt: [{ courtName, count }],
 *     peakHours: [{ hour, count }],
 *     cancelledCount,
 *     newMemberRegistrations
 *   }
 *
 * Returns:
 *   200 — metrics object
 *   400 — invalid or missing range param
 *   401 — no valid session
 *   403 — authenticated user is not admin or super_admin
 *   500 — database error
 *
 * Requirements: 16.1, 16.2
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
  // 3. Validate query parameter
  // -------------------------------------------------------------------------
  const { searchParams } = request.nextUrl;
  const rangeParam = searchParams.get("range");

  if (
    rangeParam !== "daily" &&
    rangeParam !== "weekly" &&
    rangeParam !== "monthly"
  ) {
    return NextResponse.json(
      { error: "Invalid range. Must be 'daily', 'weekly', or 'monthly'" },
      { status: 400 }
    );
  }

  const range = rangeParam as Range;
  const rangeStart = getRangeStart(range);
  const today = getToday();

  // -------------------------------------------------------------------------
  // 4. Fetch data using admin client (bypasses RLS)
  // -------------------------------------------------------------------------
  const adminClient = createAdminClient();

  // Fetch all bookings in range with court name joined
  const { data: bookings, error: bookingsError } = await adminClient
    .from("bookings")
    .select("id, court_id, start_time, status, courts(name)")
    .gte("booking_date", rangeStart)
    .lte("booking_date", today);

  if (bookingsError) {
    return NextResponse.json(
      { error: "Failed to fetch bookings" },
      { status: 500 }
    );
  }

  // Fetch new member registrations in range
  const { data: newMembers, error: membersError } = await adminClient
    .from("users")
    .select("id")
    .eq("role", "member")
    .gte("created_at", `${rangeStart}T00:00:00.000Z`);

  if (membersError) {
    return NextResponse.json(
      { error: "Failed to fetch member registrations" },
      { status: 500 }
    );
  }

  // -------------------------------------------------------------------------
  // 5. Compute metrics
  // -------------------------------------------------------------------------
  const rows = bookings ?? [];

  // totalBookings
  const totalBookings = rows.length;

  // cancelledCount
  const cancelledCount = rows.filter((b) => b.status === "cancelled").length;

  // bookingsPerCourt
  const courtCountMap = new Map<string, number>();
  for (const b of rows) {
    const courtName =
      (b.courts as { name: string } | null)?.name ?? "Unknown Court";
    courtCountMap.set(courtName, (courtCountMap.get(courtName) ?? 0) + 1);
  }
  const bookingsPerCourt: BookingPerCourt[] = Array.from(
    courtCountMap.entries()
  )
    .map(([courtName, count]) => ({ courtName, count }))
    .sort((a, b) => b.count - a.count);

  // peakHours — extract hour from start_time "HH:MM:SS" or "HH:MM"
  const hourCountMap = new Map<number, number>();
  for (const b of rows) {
    if (b.start_time) {
      const hour = parseInt(b.start_time.slice(0, 2), 10);
      if (!isNaN(hour)) {
        hourCountMap.set(hour, (hourCountMap.get(hour) ?? 0) + 1);
      }
    }
  }
  const peakHours: PeakHour[] = Array.from(hourCountMap.entries())
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour - b.hour);

  // newMemberRegistrations
  const newMemberRegistrations = (newMembers ?? []).length;

  // -------------------------------------------------------------------------
  // 6. Return metrics
  // -------------------------------------------------------------------------
  const metrics: ReportMetrics = {
    range,
    totalBookings,
    bookingsPerCourt,
    peakHours,
    cancelledCount,
    newMemberRegistrations,
  };

  return NextResponse.json(metrics, { status: 200 });
}
