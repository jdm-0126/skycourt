import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteParams = { params: Promise<{ id: string }> };

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
