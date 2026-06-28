import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { settingsSchema, DEFAULT_HOMEPAGE_ORDER, type HomepageSection } from "@/lib/validation/settings";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SystemSettingRow {
  id: string;
  key: string;
  value: string;
  updated_at: string;
}

/**
 * The shape we expose to the client as a flat object.
 * Values are coerced to their proper JS types before sending.
 */
interface SettingsPayload {
  site_name: string;
  contact_email: string;
  maintenance_mode: boolean;
  theme_mode: "light" | "dark";
  map_url: string;
  homepage_order: HomepageSection[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts and validates the authenticated super_admin from the incoming
 * request.  Returns the user ID on success or a NextResponse error reply.
 */
async function authoriseSuperAdmin(): Promise<
  | { userId: string; error: null }
  | { userId: null; error: NextResponse }
> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      userId: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const role =
    (user.app_metadata?.role as string | undefined) ??
    (user.user_metadata?.role as string | undefined);

  if (role !== "super_admin") {
    return {
      userId: null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { userId: user.id, error: null };
}

/**
 * Converts a flat array of `{ key, value }` rows from `system_settings`
 * into the typed `SettingsPayload` object returned to the client.
 */
function rowsToPayload(rows: SystemSettingRow[]): SettingsPayload {
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  // Parse homepage_order — stored as JSON string
  let homepage_order: HomepageSection[] = DEFAULT_HOMEPAGE_ORDER;
  if (map["homepage_order"]) {
    try {
      const parsed = JSON.parse(map["homepage_order"]) as unknown;
      if (Array.isArray(parsed)) {
        homepage_order = parsed as HomepageSection[];
      }
    } catch {
      // keep default
    }
  }

  return {
    site_name: map["site_name"] ?? "",
    contact_email: map["contact_email"] ?? "",
    maintenance_mode: map["maintenance_mode"] === "true",
    theme_mode: (map["theme_mode"] === "dark" ? "dark" : "light"),
    map_url: map["map_url"] ?? "",
    homepage_order,
  };
}

// ---------------------------------------------------------------------------
// GET /api/settings
// ---------------------------------------------------------------------------

/**
 * GET /api/settings
 *
 * Returns all system settings as a flat object.
 * Requires `super_admin` role.
 *
 * Returns:
 *   200 — { data: SettingsPayload }
 *   401 — no valid session
 *   403 — caller is not super_admin
 *   500 — database error
 *
 * Requirements: 22.1
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  // -------------------------------------------------------------------------
  // 1. Auth + authorisation
  // -------------------------------------------------------------------------
  const auth = await authoriseSuperAdmin();
  if (auth.error) return auth.error;

  // -------------------------------------------------------------------------
  // 2. Fetch all settings rows
  // -------------------------------------------------------------------------
  const adminClient = createAdminClient();

  const { data, error: fetchError } = await adminClient
    .from("system_settings")
    .select("id, key, value, updated_at")
    .order("key", { ascending: true });

  if (fetchError) {
    console.error("[GET /api/settings] DB fetch failed:", fetchError.message);
    return NextResponse.json(
      { error: "Failed to fetch settings. Please try again." },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as SystemSettingRow[];

  return NextResponse.json(
    { data: rowsToPayload(rows), rows },
    { status: 200 }
  );
}

// ---------------------------------------------------------------------------
// PATCH /api/settings
// ---------------------------------------------------------------------------

/**
 * PATCH /api/settings
 *
 * Updates one or more system settings (site_name, contact_email,
 * maintenance_mode).  Each setting is stored as a separate key-value row
 * in `system_settings`; this handler upserts only the keys present in the
 * request body.
 *
 * Request body (JSON):
 *   {
 *     site_name?:        string  — non-empty, max 200 chars
 *     contact_email?:    string  — valid email format
 *     maintenance_mode?: boolean
 *   }
 *
 * Returns:
 *   200 — { data: SettingsPayload }     (all settings after update)
 *   400 — validation error
 *   401 — no valid session
 *   403 — caller is not super_admin
 *   500 — database error
 *
 * Requirements: 22.1, 22.2, 22.3
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  // -------------------------------------------------------------------------
  // 1. Auth + authorisation
  // -------------------------------------------------------------------------
  const auth = await authoriseSuperAdmin();
  if (auth.error) return auth.error;

  // -------------------------------------------------------------------------
  // 2. Parse and validate request body
  // -------------------------------------------------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid request body." },
      { status: 400 }
    );
  }

  const updates = parsed.data;
  const adminClient = createAdminClient();
  const now = new Date().toISOString();

  // -------------------------------------------------------------------------
  // 3. Upsert each setting that was provided
  //    system_settings has a unique constraint on `key`, so we can use
  //    onConflict('key') to update existing rows.
  // -------------------------------------------------------------------------
  const upserts: { key: string; value: string; updated_at: string }[] = [];

  if (updates.site_name !== undefined) {
    upserts.push({ key: "site_name", value: updates.site_name, updated_at: now });
  }
  if (updates.contact_email !== undefined) {
    upserts.push({ key: "contact_email", value: updates.contact_email, updated_at: now });
  }
  if (updates.maintenance_mode !== undefined) {
    upserts.push({
      key: "maintenance_mode",
      value: updates.maintenance_mode ? "true" : "false",
      updated_at: now,
    });
  }
  if (updates.theme_mode !== undefined) {
    upserts.push({ key: "theme_mode", value: updates.theme_mode, updated_at: now });
  }
  if (updates.map_url !== undefined) {
    upserts.push({ key: "map_url", value: updates.map_url, updated_at: now });
  }
  if (updates.homepage_order !== undefined) {
    upserts.push({
      key: "homepage_order",
      value: JSON.stringify(updates.homepage_order),
      updated_at: now,
    });
  }

  const { error: upsertError } = await adminClient
    .from("system_settings")
    .upsert(upserts, { onConflict: "key" });

  if (upsertError) {
    console.error("[PATCH /api/settings] Upsert failed:", upsertError.message);
    return NextResponse.json(
      { error: "Failed to update settings. Please try again." },
      { status: 500 }
    );
  }

  // -------------------------------------------------------------------------
  // 4. Return the complete settings after update
  // -------------------------------------------------------------------------
  const { data: allRows, error: fetchError } = await adminClient
    .from("system_settings")
    .select("id, key, value, updated_at")
    .order("key", { ascending: true });

  if (fetchError) {
    console.error("[PATCH /api/settings] Post-update fetch failed:", fetchError.message);
    return NextResponse.json(
      { error: "Settings saved but could not be re-fetched." },
      { status: 500 }
    );
  }

  const rows = (allRows ?? []) as SystemSettingRow[];

  return NextResponse.json({ data: rowsToPayload(rows) }, { status: 200 });
}
