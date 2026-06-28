import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/contact
 *
 * Public endpoint — validates the request body and inserts a new
 * contact_messages row using the admin client (bypasses RLS so public users
 * can submit without authentication).
 *
 * Returns:
 *  201 — message saved successfully
 *  400 — validation error (missing fields or invalid email)
 *  500 — database error
 *
 * Requirements: 3.2 (save submission), 3.3/3.4 (validation), 3.5 (success)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // -------------------------------------------------------------------------
  // 1. Parse request body
  // -------------------------------------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 });
  }

  const { sender_name, sender_email, message } = body as Record<string, unknown>;

  // -------------------------------------------------------------------------
  // 2. Manual validation (mirrors contactSchema rules)
  //    We validate here server-side to guard against direct API calls.
  // -------------------------------------------------------------------------
  const fieldErrors: Record<string, string> = {};

  if (!sender_name || typeof sender_name !== "string" || sender_name.trim().length === 0) {
    fieldErrors.sender_name = "Name is required";
  }

  if (!sender_email || typeof sender_email !== "string" || sender_email.trim().length === 0) {
    fieldErrors.sender_email = "Email is required";
  } else {
    // Basic RFC 5322-compatible email regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(sender_email.trim())) {
      fieldErrors.sender_email = "Please enter a valid email address";
    }
  }

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    fieldErrors.message = "Message is required";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return NextResponse.json(
      { error: "Validation error", details: fieldErrors },
      { status: 400 }
    );
  }

  // -------------------------------------------------------------------------
  // 3. Insert using admin client (bypasses RLS — public endpoint, Req 3.2)
  // -------------------------------------------------------------------------
  const adminClient = createAdminClient();

  const { error: insertError } = await adminClient
    .from("contact_messages")
    .insert({
      sender_name: (sender_name as string).trim(),
      sender_email: (sender_email as string).trim(),
      message: (message as string).trim(),
      // status defaults to 'unread' via DB default
    });

  if (insertError) {
    console.error("[POST /api/contact] DB insert error:", insertError.message);
    return NextResponse.json(
      { error: "Failed to save your message. Please try again later." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
