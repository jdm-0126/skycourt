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
 * Reads the current Supabase session to determine the user's role, then
 * computes the appropriate set of navigation links and passes them to the
 * `NavbarClient` client component which handles mobile drawer toggle and
 * the Logout action.
 *
 * Requirements: 23.1, 23.2, 23.3, 23.4
 */
export default async function Navbar() {
  // Retrieve the current user from the server-side Supabase client.
  // `getUser()` validates the JWT with the Supabase Auth server, making it
  // safe to trust the returned user object for role-based decisions.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = ((user?.app_metadata?.role ?? user?.user_metadata?.role) ?? null) as UserRole;

  const { roleLinks, showLogout } = resolveRoleLinks(role);

  return (
    <NavbarClient
      commonLinks={COMMON_LINKS}
      roleLinks={roleLinks}
      showLogout={showLogout}
    />
  );
}
