import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteParams = { params: Promise<{ id: string }> };

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ReduceCourtsBody {
  action: "cancel" | "reduce_courts";
  /** For reduce_courts: array of court IDs to KEEP (must be a strict subset). */
  keepCourtIds?: string[];
}

/**
 * GET /api/bookings/club/:id
 *
 * Returns a single club reservation with its associated courts.
 * Only the owner or an admin may view it.
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  const { data: reservation, error } = await adminClient
    .from("club_reservations")
    .select("*, club_reservation_courts(court_id, courts(name))")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to fetch reservation" }, { status: 500 });
  }
  if (!reservation) {
    return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  }

  const role =
    (user.app_metadata?.role as string | undefined) ??
    (user.user_metadata?.role as string | undefined);

  const isOwner = reservation.member_id === user.id;
  const isAdmin = role === "admin" || role === "super_admin";

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ reservation });
}

/**
 * PATCH /api/bookings/club/:id
 *
 * Two actions allowed for club reservations:
 *
 *   action: "cancel"
 *     - Cancels the entire reservation.
 *     - Allowed up to and including the day before the reservation date.
 *     - Owner or admin can cancel.
 *
 *   action: "reduce_courts"
 *     - Removes some courts from the reservation (keepCourtIds contains
 *       the courts to retain; at least 1 must remain).
 *     - Only allowed up to the day BEFORE the reservation date.
 *     - Total cost is recalculated based on remaining courts.
 *     - Owner or admin can reduce.
 *
 * Returns 200 with the updated reservation on success.
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id: reservationId } = await params;

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  // Fetch the reservation
  const { data: reservation, error: fetchError } = await adminClient
    .from("club_reservations")
    .select("*, club_reservation_courts(court_id)")
    .eq("id", reservationId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: "Failed to fetch reservation" }, { status: 500 });
  }
  if (!reservation) {
    return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  }

  const role =
    (user.app_metadata?.role as string | undefined) ??
    (user.user_metadata?.role as string | undefined);

  const isOwner = reservation.member_id === user.id;
  const isAdmin = role === "admin" || role === "super_admin";

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (reservation.status === "cancelled") {
    return NextResponse.json({ error: "Reservation is already cancelled" }, { status: 409 });
  }

  // Check deadline: must be done by the day before the reservation
  const reservationDate = new Date(`${reservation.reservation_date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayBeforeReservation = new Date(reservationDate);
  dayBeforeReservation.setDate(dayBeforeReservation.getDate() - 1);

  const isBeforeDeadline = today <= dayBeforeReservation;

  let body: ReduceCourtsBody;
  try {
    body = (await request.json()) as ReduceCourtsBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action } = body;

  if (action !== "cancel" && action !== "reduce_courts") {
    return NextResponse.json(
      { error: "Invalid action. Must be 'cancel' or 'reduce_courts'" },
      { status: 400 }
    );
  }

  // ---------------------------------------------------------------------------
  // CANCEL
  // ---------------------------------------------------------------------------
  if (action === "cancel") {
    if (!isBeforeDeadline) {
      return NextResponse.json(
        { error: "Club reservations can only be cancelled before the day of the event" },
        { status: 422 }
      );
    }

    const { data: updated, error: cancelError } = await adminClient
      .from("club_reservations")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", reservationId)
      .select()
      .single();

    if (cancelError || !updated) {
      return NextResponse.json({ error: "Failed to cancel reservation" }, { status: 500 });
    }

    try {
      await adminClient.from("audit_logs").insert({
        user_id: user.id,
        action_type: "club_reservation_cancelled",
        affected_record_id: reservationId,
        metadata: { reservation_date: reservation.reservation_date },
      });
    } catch { /* non-fatal */ }

    return NextResponse.json({ reservation: updated });
  }

  // ---------------------------------------------------------------------------
  // REDUCE_COURTS
  // ---------------------------------------------------------------------------
  if (!isBeforeDeadline) {
    return NextResponse.json(
      { error: "Courts can only be reduced before the day of the event" },
      { status: 422 }
    );
  }

  const { keepCourtIds } = body;

  if (!keepCourtIds || !Array.isArray(keepCourtIds) || keepCourtIds.length === 0) {
    return NextResponse.json(
      { error: "keepCourtIds must be a non-empty array of court UUIDs" },
      { status: 400 }
    );
  }

  for (const cid of keepCourtIds) {
    if (!uuidRegex.test(cid)) {
      return NextResponse.json({ error: `Invalid court ID: ${cid}` }, { status: 400 });
    }
  }

  // Current courts
  const currentCourtIds: string[] = (
    reservation.club_reservation_courts as { court_id: string }[]
  ).map((r) => r.court_id);

  // keepCourtIds must be a subset of currentCourtIds
  const invalidKeep = keepCourtIds.filter((id) => !currentCourtIds.includes(id));
  if (invalidKeep.length > 0) {
    return NextResponse.json(
      { error: `The following court IDs are not part of this reservation: ${invalidKeep.join(", ")}` },
      { status: 400 }
    );
  }

  if (keepCourtIds.length >= currentCourtIds.length) {
    return NextResponse.json(
      { error: "To reduce courts, keepCourtIds must be fewer than the current number of courts" },
      { status: 400 }
    );
  }

  // Determine which courts to remove
  const removeCourtIds = currentCourtIds.filter((id) => !keepCourtIds.includes(id));

  // Delete removed court rows
  const { error: deleteError } = await adminClient
    .from("club_reservation_courts")
    .delete()
    .eq("reservation_id", reservationId)
    .in("court_id", removeCourtIds);

  if (deleteError) {
    return NextResponse.json({ error: "Failed to remove courts from reservation" }, { status: 500 });
  }

  // Recalculate cost
  const RATE = 400;
  const newTotalCost = keepCourtIds.length * reservation.duration_hours * RATE;

  const { data: updated, error: updateError } = await adminClient
    .from("club_reservations")
    .update({
      num_courts: keepCourtIds.length,
      total_cost: newTotalCost,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reservationId)
    .select()
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: "Failed to update reservation" }, { status: 500 });
  }

  try {
    await adminClient.from("audit_logs").insert({
      user_id: user.id,
      action_type: "club_reservation_courts_reduced",
      affected_record_id: reservationId,
      metadata: {
        removed_court_ids: removeCourtIds,
        kept_court_ids: keepCourtIds,
        new_num_courts: keepCourtIds.length,
        new_total_cost: newTotalCost,
      },
    });
  } catch { /* non-fatal */ }

  return NextResponse.json({ reservation: updated });
}
