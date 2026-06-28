import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/auth/sync-role
 *
 * Reads the authenticated user's role from public.users and writes it into
 * auth.users.app_metadata so that the edge middleware can read it from the
 * JWT on subsequent requests — without needing a DB query on every request.
 *
 * Called once after a successful login when app_metadata.role is missing.
 * Safe to call multiple times (idempotent).
 */
export async function POST(): Promise<NextResponse> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch the authoritative role from public.users.
  // Cast to a plain object so TypeScript doesn't narrow the result to `never`
  // when the generated Supabase types don't yet include the `users` table.
  const { data: userRow, error: dbError } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single() as unknown as {
      data: { role: string } | null;
      error: { message: string } | null;
    };

  if (dbError || !userRow?.role) {
    return NextResponse.json({ error: "User record not found" }, { status: 404 });
  }

  const role: string = userRow.role;

  // Already in sync — nothing to do
  if (user.app_metadata?.role === role) {
    return NextResponse.json({ role });
  }

  // Write role into app_metadata via admin SDK (service role bypasses RLS)
  const adminClient = createAdminClient();
  const { error: updateError } = await adminClient.auth.admin.updateUserById(
    user.id,
    { app_metadata: { ...user.app_metadata, role } }
  );

  if (updateError) {
    console.error("[sync-role] Failed to update app_metadata:", updateError.message);
    return NextResponse.json({ error: "Failed to sync role" }, { status: 500 });
  }

  return NextResponse.json({ role });
}
