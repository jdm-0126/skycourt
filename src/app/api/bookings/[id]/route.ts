import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteParams = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// Request body shape for PATCH /api/bookings/:id
// ---------------------------------------------------------------------------
interface PatchBookingBody {
  action: "approve" | "reschedule";
  bookingDate?: string;
  startTime?: string;
  endTime?: string;
}

/**
 * PATCH /api/bookings/:id
 *
 * Admin-only endpoint that either approves a pending booking or reschedules
 * an existing one.
 *
 * Steps:
 *   1. Authenticate — 401 if no session
 *   2. Authorise — role must be admin or super_admin → 403 if not
 *   3. Fetch the booking by ID via admin client — 404 if not found
 *   4. Parse and validate body — 400 for malformed input
 *   5a. Approve action:
 *       - 409 if status !== 'pending' (idempotency guard)
 *       - Update status → 'confirmed'
 *       - Write audit log (action_type = 'booking_approval')
 *       - Log email placeholder
 *   5b. Reschedule action:
 *       - 400 if bookingDate / startTime / endTime missing
 *       - 409 if status === 'cancelled' (cannot reschedule cancelled)
 *       - Update booking_date, start_time, end_time (+ set status = 'confirmed')
 *       - Write audit log (action_type = 'booking_reschedule')
 *       - Log email placeholder
 *   6. Return 200 with updated booking
 *
 * Requirements: 11.2, 11.4, 20.1
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id: bookingId } = await params;

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
  // 3. Fetch the booking via admin client (bypasses RLS)
  // -------------------------------------------------------------------------
  const adminClient = createAdminClient();

  const { data: booking, error: fetchError } = await adminClient
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json(
      { error: "Failed to fetch booking" },
      { status: 500 }
    );
  }

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  // -------------------------------------------------------------------------
  // 4. Parse request body
  // -------------------------------------------------------------------------
  let body: PatchBookingBody;
  try {
    body = (await request.json()) as PatchBookingBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { action, bookingDate, startTime, endTime } = body;

  if (action !== "approve" && action !== "reschedule") {
    return NextResponse.json(
      { error: "Invalid action. Must be 'approve' or 'reschedule'" },
      { status: 400 }
    );
  }

  // -------------------------------------------------------------------------
  // 5a. Approve action
  // -------------------------------------------------------------------------
  if (action === "approve") {
    // Idempotency guard: only pending bookings can be approved
    if (booking.status !== "pending") {
      return NextResponse.json(
        {
          error: `Booking cannot be approved because its current status is '${booking.status}'`,
        },
        { status: 409 }
      );
    }

    // Update status to confirmed
    const { data: updatedBooking, error: updateError } = await adminClient
      .from("bookings")
      .update({ status: "confirmed", updated_at: new Date().toISOString() })
      .eq("id", bookingId)
      .select()
      .single();

    if (updateError || !updatedBooking) {
      return NextResponse.json(
        { error: "Failed to approve booking" },
        { status: 500 }
      );
    }

    // Write audit log — fire-and-forget
    try {
      await adminClient.from("audit_logs").insert({
        user_id: user.id,
        action_type: "booking_approval",
        affected_record_id: bookingId,
        metadata: {
          booking_date: booking.booking_date,
          court_id: booking.court_id,
          member_id: booking.member_id,
          previous_status: booking.status,
        },
      });
    } catch {
      // Audit log failure is non-fatal
    }

    // Email notification placeholder
    console.log(
      `[Email] Booking approval notification would be sent to member (user_id: ${booking.member_id}) for booking ${bookingId} on ${booking.booking_date}`
    );

    return NextResponse.json({ booking: updatedBooking }, { status: 200 });
  }

  // -------------------------------------------------------------------------
  // 5b. Reschedule action
  // -------------------------------------------------------------------------
  // Validate required fields
  if (!bookingDate || !startTime || !endTime) {
    return NextResponse.json(
      {
        error:
          "bookingDate, startTime, and endTime are required for reschedule",
      },
      { status: 400 }
    );
  }

  // Cannot reschedule a cancelled booking
  if (booking.status === "cancelled") {
    return NextResponse.json(
      { error: "Cannot reschedule a cancelled booking" },
      { status: 409 }
    );
  }

  // Update booking date/time and set status to confirmed
  const { data: rescheduledBooking, error: rescheduleError } = await adminClient
    .from("bookings")
    .update({
      booking_date: bookingDate,
      start_time: startTime,
      end_time: endTime,
      status: "confirmed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId)
    .select()
    .single();

  if (rescheduleError || !rescheduledBooking) {
    return NextResponse.json(
      { error: "Failed to reschedule booking" },
      { status: 500 }
    );
  }

  // Write audit log — fire-and-forget
  try {
    await adminClient.from("audit_logs").insert({
      user_id: user.id,
      action_type: "booking_reschedule",
      affected_record_id: bookingId,
      metadata: {
        old_date: booking.booking_date,
        old_start_time: booking.start_time,
        old_end_time: booking.end_time,
        new_date: bookingDate,
        new_start_time: startTime,
        new_end_time: endTime,
        court_id: booking.court_id,
        member_id: booking.member_id,
      },
    });
  } catch {
    // Audit log failure is non-fatal
  }

  // Email notification placeholder
  console.log(
    `[Email] Reschedule notification would be sent to member (user_id: ${booking.member_id}) for booking ${bookingId}. New date: ${bookingDate} ${startTime}–${endTime}`
  );

  return NextResponse.json({ booking: rescheduledBooking }, { status: 200 });
}

/**
 * DELETE /api/bookings/:id
 *
 * Cancels a booking. The requesting user must either own the booking or
 * hold an admin / super_admin role.
 *
 * Steps:
 *   1. Authenticate — 401 if no session
 *   2. Fetch the booking by ID — 404 if not found
 *   3. Authorise — member owns booking OR role is admin / super_admin → 403 if neither
 *   4. Guard against double-cancel — 409 if already cancelled
 *   5. Set status = 'cancelled' via the admin client (bypasses RLS)
 *   6. Write audit log entry
 *   7. Log email notification (email sending placeholder)
 *   8. Return 200 { success: true }
 *
 * Requirements: 8.4, 8.5, 20.1
 */
export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id: bookingId } = await params;

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
  // 2. Fetch the booking (use admin client to allow admins to see all rows)
  // -------------------------------------------------------------------------
  const adminClient = createAdminClient();

  const { data: booking, error: fetchError } = await adminClient
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json(
      { error: "Failed to fetch booking" },
      { status: 500 }
    );
  }

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  // -------------------------------------------------------------------------
  // 3. Authorise — owner or admin / super_admin
  // -------------------------------------------------------------------------
  const role =
    (user.app_metadata?.role as string | undefined) ??
    (user.user_metadata?.role as string | undefined);

  const isOwner = booking.member_id === user.id;
  const isAdmin = role === "admin" || role === "super_admin";

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // -------------------------------------------------------------------------
  // 4. Guard against double-cancel
  // -------------------------------------------------------------------------
  if (booking.status === "cancelled") {
    return NextResponse.json(
      { error: "Booking is already cancelled" },
      { status: 409 }
    );
  }

  // -------------------------------------------------------------------------
  // 5. Cancel the booking (admin client bypasses RLS so admins can cancel
  //    any member's booking, not just their own)
  // -------------------------------------------------------------------------
  const { error: updateError } = await adminClient
    .from("bookings")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", bookingId);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to cancel booking" },
      { status: 500 }
    );
  }

  // -------------------------------------------------------------------------
  // 6. Write audit log — fire-and-forget; must not block the response
  // -------------------------------------------------------------------------
  try {
    await adminClient.from("audit_logs").insert({
      user_id: user.id,
      action_type: "booking_cancellation",
      affected_record_id: bookingId,
      metadata: {
        booking_date: booking.booking_date,
        court_id: booking.court_id,
      },
    });
  } catch {
    // Audit log failure is non-fatal — the cancellation already succeeded
  }

  // -------------------------------------------------------------------------
  // 7. Email notification placeholder
  //    Replace with a real email service call (e.g. Resend, SendGrid) once
  //    the email integration task is implemented.
  // -------------------------------------------------------------------------
  console.log(
    `[Email] Cancellation notification would be sent to member (user_id: ${user.id}) for booking ${bookingId} on ${booking.booking_date}`
  );

  return NextResponse.json({ success: true });
}
