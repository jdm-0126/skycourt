import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Supabase Admin client using the SERVICE ROLE key.
 *
 * ⚠️  SECURITY WARNING:
 * This client BYPASSES Row Level Security (RLS).
 * It MUST ONLY be used in server-side API Route Handlers.
 * NEVER import or use this module in Client Components or browser code.
 *
 * Use cases:
 * - Creating admin accounts (super_admin only)
 * - Terminating user sessions
 * - Database backup operations
 * - Any operation that requires elevated privileges beyond RLS
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!serviceRoleKey) {
    throw new Error("Missing environment variable: SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      // Disable session persistence for server-side admin operations
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
