import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bookingSchema } from "@/lib/validation";
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

/**
 * Sends a booking confirmation email to the member.
 *
 * Currently a placeholder — replace the console.log with a real email
 * service call (e.g. Resend, SendGrid) once SMTP is configured.
 */
function sendBookingConfirmationEmail(params: {
  memberId: string;
  bookingId: string;
  courtId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
}): void {
  // TODO: Replace with real email service integration
  console.log(
    `[Email] Booking confirmation would be sent to member (user_id: ${params.memberId}) ` +
      `for booking ${params.bookingId} on ${params.bookingDate} ` +
      `${params.startTime}–${params.endTime} (court: ${params.courtId})`
  );
}

/**
 * POST /api/bookings
 *
 * Creates a new booking for the authenticated member.
 *
 * Steps:
 *   1. Authenticate — 401 if no session
 *   2. Validate request body with bookingSchema — 400 on validation failure
 *   3. Court availability check — 422 if court status is not 'available'
 *   4. Unavailable date check — 422 if the date is blocked for this court
 *   5. Slot conflict check — 409 if a Pending/Confirmed booking already exists
 *      for the same court_id + booking_date + start_time
 *   6. Insert booking with status = 'Pending'
 *      — also catches DB unique-constraint violation and returns 409
 *   7. Send booking confirmation email (placeholder)
 *   8. Write audit_log entry (action_type = 'booking_created')
 *   9. Return 201 with the created booking
 *
 * Requirements: 7.3, 7.4, 7.5, 7.7, 20.1
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
  // 2. Parse and validate request body
  // -------------------------------------------------------------------------
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parseResult = bookingSchema.safeParse(rawBody);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const { courtId, bookingDate, startTime, endTime } = parseResult.data;

  // -------------------------------------------------------------------------
  // 3. Court availability check
  // -------------------------------------------------------------------------
  const { data: courtDataRaw, error: courtError } = await supabase
    .from("courts")
    .select("*")
    .eq("id", courtId)
    .maybeSingle();

  const courtData = courtDataRaw as
    | Database["public"]["Tables"]["courts"]["Row"]
    | null;

  if (courtError) {
    return NextResponse.json(
      { error: "Failed to fetch court" },
      { status: 500 }
    );
  }

  if (!courtData) {
    return NextResponse.json(
      {
        error: "COURT_UNAVAILABLE",
        message: "This court is currently unavailable",
      },
      { status: 422 }
    );
  }

  if (courtData.status !== "available") {
    return NextResponse.json(
      {
        error: "COURT_UNAVAILABLE",
        message: "This court is currently unavailable",
      },
      { status: 422 }
    );
  }

  // -------------------------------------------------------------------------
  // 4. Unavailable date check
  // -------------------------------------------------------------------------
  const { data: unavailableDate, error: unavailableDateError } = await supabase
    .from("court_unavailable_dates")
    .select("id")
    .eq("court_id", courtId)
    .eq("unavailable_date", bookingDate)
    .maybeSingle();

  if (unavailableDateError) {
    return NextResponse.json(
      { error: "Failed to check date availability" },
      { status: 500 }
    );
  }

  if (unavailableDate) {
    return NextResponse.json(
      {
        error: "DATE_UNAVAILABLE",
        message: "This court is unavailable on the selected date",
      },
      { status: 422 }
    );
  }

  // -------------------------------------------------------------------------
  // 5. Slot conflict check
  //    Application-level guard in addition to the DB unique partial index.
  // -------------------------------------------------------------------------
  const { data: conflictData, error: conflictError } = await supabase
    .from("bookings")
    .select("id")
    .eq("court_id", courtId)
    .eq("booking_date", bookingDate)
    .eq("start_time", startTime)
    .in("status", ["pending", "confirmed"])
    .maybeSingle();

  if (conflictError) {
    return NextResponse.json(
      { error: "Failed to check slot availability" },
      { status: 500 }
    );
  }

  if (conflictData) {
    return NextResponse.json(
      {
        error: "SLOT_CONFLICT",
        message: "This slot has just been booked. Please select a different slot.",
      },
      { status: 409 }
    );
  }

  // -------------------------------------------------------------------------
  // 6. Insert booking
  // -------------------------------------------------------------------------
  const adminClient = createAdminClient();

  const { data: newBooking, error: insertError } = await adminClient
    .from("bookings")
    .insert({
      member_id: user.id,
      court_id: courtId,
      booking_date: bookingDate,
      start_time: startTime,
      end_time: endTime,
      status: "pending",
    })
    .select()
    .single();

  if (insertError) {
    // Catch unique constraint violation from the DB partial index
    // Postgres error code 23505 = unique_violation
    if (
      insertError.code === "23505" ||
      insertError.message?.toLowerCase().includes("unique")
    ) {
      return NextResponse.json(
        {
          error: "SLOT_CONFLICT",
          message:
            "This slot has just been booked. Please select a different slot.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create booking" },
      { status: 500 }
    );
  }

  if (!newBooking) {
    return NextResponse.json(
      { error: "Failed to create booking" },
      { status: 500 }
    );
  }

  // -------------------------------------------------------------------------
  // 7. Send confirmation email (placeholder)
  // -------------------------------------------------------------------------
  sendBookingConfirmationEmail({
    memberId: user.id,
    bookingId: newBooking.id,
    courtId,
    bookingDate,
    startTime,
    endTime,
  });

  // -------------------------------------------------------------------------
  // 8. Write audit log — fire-and-forget; must not block the response
  // -------------------------------------------------------------------------
  try {
    await adminClient.from("audit_logs").insert({
      user_id: user.id,
      action_type: "booking_created",
      affected_record_id: newBooking.id,
      metadata: {
        court_id: courtId,
        booking_date: bookingDate,
        start_time: startTime,
        end_time: endTime,
        status: "pending",
      },
    });
  } catch {
    // Audit log failure is non-fatal — the booking already succeeded
  }

  // -------------------------------------------------------------------------
  // 9. Return 201 with the created booking
  // -------------------------------------------------------------------------
  return NextResponse.json({ booking: newBooking }, { status: 201 });
}
