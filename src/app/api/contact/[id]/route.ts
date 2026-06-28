import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteParams = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// Request body shape for PATCH /api/contact/:id
// ---------------------------------------------------------------------------
interface PatchContactBody {
  action: "reply" | "archive";
}

/**
 * PATCH /api/contact/:id
 *
 * Admin-only endpoint — updates the status of a contact message.
 *
 * Action semantics:
 *   - "archive" → always sets status to "archived" regardless of current state
 *   - "reply"   → sets status to "replied" ONLY if the message is NOT already
 *                 archived (archive takes precedence)
 *
 * Steps:
 *   1. Authenticate — 401 if no session
 *   2. Authorise — role must be admin or super_admin → 403 if not
 *   3. Parse and validate request body — 400 for invalid action
 *   4. Fetch the contact message via admin client — 404 if not found
 *   5. Apply status transition logic
 *   6. Update via admin client
 *   7. Return 200 with the updated contact_message record
 *
 * Returns:
 *   200 — { message: ContactMessage }
 *   400 — invalid action value
 *   401 — no valid session
 *   403 — authenticated but not admin+
 *   404 — message not found
 *   500 — database error
 *
 * Requirements: 15.2, 15.3
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id: messageId } = await params;

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
  // 3. Parse and validate request body
  // -------------------------------------------------------------------------
  let body: PatchContactBody;
  try {
    body = (await request.json()) as PatchContactBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action } = body;

  if (action !== "reply" && action !== "archive") {
    return NextResponse.json(
      { error: "Invalid action. Must be 'reply' or 'archive'" },
      { status: 400 }
    );
  }

  // -------------------------------------------------------------------------
  // 4. Fetch the contact message via admin client (bypasses RLS)
  // -------------------------------------------------------------------------
  const adminClient = createAdminClient();

  const { data: contactMessage, error: fetchError } = await adminClient
    .from("contact_messages")
    .select("*")
    .eq("id", messageId)
    .maybeSingle();

  if (fetchError) {
    console.error(
      "[PATCH /api/contact/:id] DB fetch error:",
      fetchError.message
    );
    return NextResponse.json(
      { error: "Failed to fetch contact message" },
      { status: 500 }
    );
  }

  if (!contactMessage) {
    return NextResponse.json(
      { error: "Contact message not found" },
      { status: 404 }
    );
  }

  // -------------------------------------------------------------------------
  // 5. Apply status transition logic
  //    - archive always wins (sets status = "archived")
  //    - reply only applies if NOT already archived
  // -------------------------------------------------------------------------
  let newStatus: "replied" | "archived";

  if (action === "archive") {
    newStatus = "archived";
  } else {
    // action === "reply"
    if (contactMessage.status === "archived") {
      // Already archived — archive takes precedence, return current record
      return NextResponse.json({ message: contactMessage }, { status: 200 });
    }
    newStatus = "replied";
  }

  // -------------------------------------------------------------------------
  // 6. Update the contact message
  // -------------------------------------------------------------------------
  const { data: updatedMessage, error: updateError } = await adminClient
    .from("contact_messages")
    .update({ status: newStatus })
    .eq("id", messageId)
    .select()
    .single();

  if (updateError || !updatedMessage) {
    console.error(
      "[PATCH /api/contact/:id] DB update error:",
      updateError?.message
    );
    return NextResponse.json(
      { error: "Failed to update contact message" },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: updatedMessage }, { status: 200 });
}
