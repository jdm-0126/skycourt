import { createClient } from "@/lib/supabase/server";
import AdminSidebarUI from "./AdminSidebarUI";

// Re-export link constants so existing imports keep working
export { ADMIN_SIDEBAR_LINKS, SUPER_ADMIN_SIDEBAR_LINKS } from "./AdminSidebarUI";
export type { SidebarLink } from "./AdminSidebarUI";

/**
 * AdminSidebar — Server Component
 *
 * Reads the current user's role from Supabase (server-side only),
 * then passes `isSuperAdmin` as a plain boolean prop to the client
 * component `AdminSidebarUI` which handles all the MUI rendering.
 *
 * Requirements: 23.5, 23.6
 */
export default async function AdminSidebar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = (
    (user?.app_metadata?.role ?? user?.user_metadata?.role) ?? null
  ) as "admin" | "super_admin" | null;

  return <AdminSidebarUI isSuperAdmin={role === "super_admin"} />;
}
