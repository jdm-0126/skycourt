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
  { label: "Dashboard", href: "/member/dashboard" },
];

/** Links shown to authenticated admins and super_admins. */
export const ADMIN_LINKS: NavLink[] = [
  { label: "Admin Panel", href: "/admin/dashboard" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function resolveRoleLinks(role: UserRole): {
  roleLinks: NavLink[];
  showLogout: boolean;
} {
  if (role === "member") {
    return { roleLinks: MEMBER_LINKS, showLogout: true };
  }
  if (role === "admin" || role === "super_admin") {
    return { roleLinks: ADMIN_LINKS, showLogout: true };
  }
  // Guest
  return { roleLinks: GUEST_LINKS, showLogout: false };
}

// ---------------------------------------------------------------------------
// Navbar — Server Component
// ---------------------------------------------------------------------------

/**
 * Top navigation bar, rendered as a React Server Component.
 *
 * Reads the current Supabase session to determine the user's role, fetches
 * the site name from system_settings, and passes everything to NavbarClient.
 *
 * Requirements: 23.1, 23.2, 23.3, 23.4
 */
export default async function Navbar() {
  const supabase = await createClient();

  // Run auth + site-name fetch in parallel
  const [{ data: { user } }, { data: settingRow }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("system_settings")
      .select("value")
      .eq("key", "site_name")
      .maybeSingle<{ value: string }>(),
  ]);

  const role = ((user?.app_metadata?.role ?? user?.user_metadata?.role) ?? null) as UserRole;
  const { roleLinks, showLogout } = resolveRoleLinks(role);

  // Display name: prefer full_name from user_metadata, fall back to email prefix
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
      showLogout={showLogout}
      siteName={siteName}
      displayName={displayName}
      userRole={role}
    />
  );
}
