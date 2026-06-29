import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLUB_RATE_PER_COURT_PER_HOUR = 400; // ₱400
const MIN_DURATION_HOURS = 4;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ClubReservationBody {
  reservationDate: string;  // "YYYY-MM-DD"
  startTime: string;        // "HH:MM"
  endTime: string;          // "HH:MM"
  durationHours: number;    // >= 4
  courtIds: string[];       // UUID[]
}

/**
 * GET /api/bookings/club
 *
 * Returns the authenticated member's club reservations (upcoming + past).
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("club_reservations")
    .select("*, club_reservation_courts(court_id, courts(name))")
    .eq("member_id", user.id)
    .order("reservation_date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch club reservations" }, { status: 500 });
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  const upcoming = (data ?? []).filter(
    (r) => r.reservation_date >= todayStr && r.status !== "cancelled"
  );
  const past = (data ?? []).filter(
    (r) => r.reservation_date < todayStr || r.status === "cancelled"
  );

  return NextResponse.json({ upcoming, past });
}

/**
 * POST /api/bookings/club
 *
 * Creates a club reservation for multiple courts over a minimum 4-hour block.
 *
 * Steps:
 *   1. Authenticate — 401 if no session
 *   2. Parse & validate request body
 *   3. Validate each court exists + is available + not on unavailable_dates
 *   4. Check for slot conflicts across all requested courts
 *   5. Insert `club_reservations` record
 *   6. Insert `club_reservation_courts` rows (one per court)
 *   7. Write audit log
 *   8. Return 201 with reservationId
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // -------------------------------------------------------------------------
  // 1. Authenticate
  // -------------------------------------------------------------------------
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // -------------------------------------------------------------------------
  // 2. Parse & validate
  // -------------------------------------------------------------------------
  let body: ClubReservationBody;
  try {
    body = (await request.json()) as ClubReservationBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { reservationDate, startTime, endTime, durationHours, courtIds } = body;

  if (!reservationDate || !isoDateRegex.test(reservationDate)) {
    return NextResponse.json({ error: "reservationDate must be in YYYY-MM-DD format" }, { status: 400 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (new Date(`${reservationDate}T00:00:00`) < today) {
    return NextResponse.json({ error: "Reservation date cannot be in the past" }, { status: 400 });
  }

  if (!startTime || !timeRegex.test(startTime)) {
    return NextResponse.json({ error: "startTime must be in HH:MM format" }, { status: 400 });
  }

  if (!endTime || !timeRegex.test(endTime) || endTime <= startTime) {
    return NextResponse.json({ error: "endTime must be in HH:MM format and after startTime" }, { status: 400 });
  }

  if (!durationHours || durationHours < MIN_DURATION_HOURS) {
    return NextResponse.json(
      { error: `Minimum duration is ${MIN_DURATION_HOURS} hours for club reservations` },
      { status: 400 }
    );
  }

  if (!courtIds || !Array.isArray(courtIds) || courtIds.length === 0) {
    return NextResponse.json({ error: "At least one courtId is required" }, { status: 400 });
  }

  for (const cid of courtIds) {
    if (!uuidRegex.test(cid)) {
      return NextResponse.json({ error: `Invalid court ID: ${cid}` }, { status: 400 });
    }
  }

  const adminClient = createAdminClient();

  // -------------------------------------------------------------------------
  // 3. Validate each court: exists, available, no blocked date
  // -------------------------------------------------------------------------
  const { data: courtsData, error: courtsError } = await adminClient
    .from("courts")
    .select("id, name, status")
    .in("id", courtIds);

  if (courtsError) {
    return NextResponse.json({ error: "Failed to fetch courts" }, { status: 500 });
  }

  if (!courtsData || courtsData.length !== courtIds.length) {
    return NextResponse.json({ error: "One or more courts not found" }, { status: 422 });
  }

  const unavailableCourt = courtsData.find((c) => c.status !== "available");
  if (unavailableCourt) {
    return NextResponse.json(
      { error: `Court "${unavailableCourt.name}" is currently unavailable` },
      { status: 422 }
    );
  }

  const { data: blockedDates, error: blockedError } = await adminClient
    .from("court_unavailable_dates")
    .select("court_id, unavailable_date")
    .in("court_id", courtIds)
    .eq("unavailable_date", reservationDate);

  if (blockedError) {
    return NextResponse.json({ error: "Failed to check date availability" }, { status: 500 });
  }

  if (blockedDates && blockedDates.length > 0) {
    const blockedCourtId = blockedDates[0].court_id;
    const blockedCourtName = courtsData.find((c) => c.id === blockedCourtId)?.name ?? "Unknown";
    return NextResponse.json(
      { error: `Court "${blockedCourtName}" is not available on the selected date` },
      { status: 422 }
    );
  }

  // -------------------------------------------------------------------------
  // 4. Check for slot conflicts in regular bookings AND club reservations
  //    A conflict exists if any pending/confirmed booking for any of these
  //    courts overlaps the requested time block on that date.
  // -------------------------------------------------------------------------
  const { data: conflicts, error: conflictError } = await adminClient
    .from("bookings")
    .select("id, court_id, start_time, end_time")
    .in("court_id", courtIds)
    .eq("booking_date", reservationDate)
    .in("status", ["pending", "confirmed"]);

  if (conflictError) {
    return NextResponse.json({ error: "Failed to check slot availability" }, { status: 500 });
  }

  // Check overlap: two time blocks overlap if start1 < end2 AND start2 < end1
  const conflicting = (conflicts ?? []).filter((b) => {
    const bStart = b.start_time.slice(0, 5);
    const bEnd = b.end_time.slice(0, 5);
    return bStart < endTime && startTime < bEnd;
  });

  if (conflicting.length > 0) {
    return NextResponse.json(
      { error: "One or more courts already have bookings during the requested time block", code: "SLOT_CONFLICT" },
      { status: 409 }
    );
  }

  // Also check against existing club reservations
  const { data: clubConflicts, error: clubConflictError } = await adminClient
    .from("club_reservation_courts")
    .select("court_id, club_reservations!inner(reservation_date, start_time, end_time, status)")
    .in("court_id", courtIds)
    .filter("club_reservations.reservation_date", "eq", reservationDate)
    .filter("club_reservations.status", "in", '("pending","confirmed")');

  if (clubConflictError) {
    // Non-fatal if table doesn't exist yet — proceed
    console.warn("[ClubBooking] Could not check club reservation conflicts:", clubConflictError.message);
  }

  if (clubConflicts && clubConflicts.length > 0) {
    const conflictingClub = clubConflicts.filter((row) => {
      const res = row.club_reservations as unknown as { start_time: string; end_time: string };
      const bStart = res.start_time.slice(0, 5);
      const bEnd = res.end_time.slice(0, 5);
      return bStart < endTime && startTime < bEnd;
    });

    if (conflictingClub.length > 0) {
      return NextResponse.json(
        { error: "One or more courts are already reserved for this time block", code: "SLOT_CONFLICT" },
        { status: 409 }
      );
    }
  }

  // -------------------------------------------------------------------------
  // 5. Insert club_reservations
  // -------------------------------------------------------------------------
  const totalCost = courtIds.length * durationHours * CLUB_RATE_PER_COURT_PER_HOUR;

  const { data: reservation, error: insertError } = await adminClient
    .from("club_reservations")
    .insert({
      member_id: user.id,
      reservation_date: reservationDate,
      start_time: startTime,
      end_time: endTime,
      duration_hours: durationHours,
      num_courts: courtIds.length,
      total_cost: totalCost,
      status: "pending",
    })
    .select()
    .single();

  if (insertError || !reservation) {
    return NextResponse.json({ error: "Failed to create club reservation" }, { status: 500 });
  }

  // -------------------------------------------------------------------------
  // 6. Insert club_reservation_courts (one row per court)
  // -------------------------------------------------------------------------
  const courtRows = courtIds.map((courtId) => ({
    reservation_id: reservation.id,
    court_id: courtId,
  }));

  const { error: courtsInsertError } = await adminClient
    .from("club_reservation_courts")
    .insert(courtRows);

  if (courtsInsertError) {
    // Rollback the reservation
    await adminClient.from("club_reservations").delete().eq("id", reservation.id);
    return NextResponse.json({ error: "Failed to link courts to reservation" }, { status: 500 });
  }

  // -------------------------------------------------------------------------
  // 7. Audit log — fire-and-forget
  // -------------------------------------------------------------------------
  try {
    await adminClient.from("audit_logs").insert({
      user_id: user.id,
      action_type: "club_reservation_created",
      affected_record_id: reservation.id,
      metadata: {
        reservation_date: reservationDate,
        start_time: startTime,
        end_time: endTime,
        duration_hours: durationHours,
        court_ids: courtIds,
        total_cost: totalCost,
      },
    });
  } catch {
    // Non-fatal
  }

  // -------------------------------------------------------------------------
  // 8. Return 201
  // -------------------------------------------------------------------------
  return NextResponse.json({ reservationId: reservation.id, reservation }, { status: 201 });
}
