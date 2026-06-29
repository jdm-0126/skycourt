import { createClient } from "@/lib/supabase/server";
import NavbarClient, { type NavLink, type UserRole } from "./NavbarClient";

// ---------------------------------------------------------------------------
// Link definitions
// ---------------------------------------------------------------------------

/** Links always present regardless of auth state. */
export const COMMON_LINKS: NavLink[] = [
  { label: "Home", href: "/" },
  { label: "Locate Us", href: "/locate" },
  { label: "Contact Us", href: "/contact" },
];

/** Links shown only to guests (unauthenticated). */
export const GUEST_LINKS: NavLink[] = [
  { label: "Book a Court", href: "/member/bookings/new" },
  { label: "Login", href: "/auth/login" },
  { label: "Register", href: "/auth/register" },
];

/** Links shown to authenticated members. */
export const MEMBER_LINKS: NavLink[] = [
  { label: "Book a Court", href: "/member/bookings/new" },
  { label: "Club Reservation", href: "/member/bookings/club/new" },
  { label: "My Bookings", href: "/member/dashboard" },
  { label: "Profile", href: "/member/profile" },
];

/** Links shown to authenticated admins (not super_admin-only). */
export const ADMIN_LINKS: NavLink[] = [
  { label: "Dashboard", href: "/admin/dashboard" },
  { label: "Bookings", href: "/admin/bookings" },
  { label: "Courts", href: "/admin/courts" },
  { label: "Users", href: "/admin/users" },
  { label: "Reports", href: "/admin/reports" },
  { label: "Messages", href: "/admin/messages" },
  { label: "Gallery", href: "/admin/gallery" },
  { label: "Website", href: "/admin/website" },
];

/** Extra links shown only to super_admins (appended after ADMIN_LINKS). */
export const SUPER_ADMIN_LINKS: NavLink[] = [
  { label: "Admins", href: "/superadmin/admins" },
  { label: "Roles", href: "/superadmin/roles" },
  { label: "Audit Logs", href: "/superadmin/audit-logs" },
  { label: "Backup", href: "/superadmin/backup" },
  { label: "Site Settings", href: "/superadmin/website-settings" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function resolveRoleLinks(role: UserRole): {
  roleLinks: NavLink[];
  superAdminLinks: NavLink[];
  showLogout: boolean;
} {
  if (role === "member") {
    return { roleLinks: MEMBER_LINKS, superAdminLinks: [], showLogout: true };
  }
  if (role === "super_admin") {
    return { roleLinks: ADMIN_LINKS, superAdminLinks: SUPER_ADMIN_LINKS, showLogout: true };
  }
  if (role === "admin") {
    return { roleLinks: ADMIN_LINKS, superAdminLinks: [], showLogout: true };
  }
  // Guest
  return { roleLinks: GUEST_LINKS, superAdminLinks: [], showLogout: false };
}

// ---------------------------------------------------------------------------
// Navbar — Server Component
// ---------------------------------------------------------------------------

/**
 * Top navigation bar, rendered as a React Server Component.
 *
 * Role-based link sets:
 *   guest       → common + guest links (Book, Login, Register)
 *   member      → common + member links (Book, Club, My Bookings, Profile)
 *   admin       → common + admin links (Dashboard, Bookings, Courts, …)
 *   super_admin → common + admin links + super_admin links
 *
 * Requirements: 23.1, 23.2, 23.3, 23.4
 */
export default async function Navbar() {
  const supabase = await createClient();

  const [{ data: { user } }, { data: settingRow }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("system_settings")
      .select("value")
      .eq("key", "site_name")
      .maybeSingle<{ value: string }>(),
  ]);

  const role = ((user?.app_metadata?.role ?? user?.user_metadata?.role) ?? null) as UserRole;
  const { roleLinks, superAdminLinks, showLogout } = resolveRoleLinks(role);

  const displayName: string | null = user
    ? ((user.user_metadata?.full_name as string | undefined) ??
       user.email?.split("@")[0] ??
       null)
    : null;

  const siteName = settingRow?.value || "Sky Court";

  return (
    <NavbarClient
      commonLinks={COMMON_LINKS}
      roleLinks={roleLinks}
      superAdminLinks={superAdminLinks}
      showLogout={showLogout}
      siteName={siteName}
      displayName={displayName}
      userRole={role}
    />
  );
}
