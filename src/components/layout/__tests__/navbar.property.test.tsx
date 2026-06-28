/**
 * Property-based tests for role-appropriate navigation links.
 *
 * **Validates: Requirements 23.2, 23.3**
 *
 * Property 37: Role-Appropriate Navigation Links
 *   For any authenticated user with role R, the navigation bar must display
 *   exactly the links appropriate for R:
 *     - member        → Dashboard link present, Logout present, Login/Register absent
 *     - admin         → Admin Panel link present, Logout present, Login/Register absent
 *     - super_admin   → Admin Panel link present, Logout present, Login/Register absent
 *   No authenticated user must see Login or Register links.
 */

import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import { render, screen } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Mock Next.js modules that are unavailable in jsdom
// ---------------------------------------------------------------------------

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// MUI's useMediaQuery returns false in jsdom → isMobile = false → desktop nav renders
vi.mock("@mui/material", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mui/material")>();
  return {
    ...actual,
    useMediaQuery: () => false,
  };
});

// Supabase browser client is imported by NavbarClient for the logout action
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { signOut: vi.fn().mockResolvedValue({}) },
  }),
}));

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------

import NavbarClient from "../NavbarClient";
import {
  resolveRoleLinks,
  COMMON_LINKS,
  MEMBER_LINKS,
  ADMIN_LINKS,
  GUEST_LINKS,
} from "../Navbar";
import type { UserRole } from "../NavbarClient";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Authenticated roles only (no null / guest) */
const authenticatedRoleArb = fc.constantFrom<UserRole>(
  "member",
  "admin",
  "super_admin"
);

/** All possible roles including guest (null) */
const anyRoleArb = fc.constantFrom<UserRole>(
  "member",
  "admin",
  "super_admin",
  null
);

// ---------------------------------------------------------------------------
// Helper: render NavbarClient and return visible text content
// ---------------------------------------------------------------------------

function renderNavbar(role: UserRole) {
  const { roleLinks, showLogout } = resolveRoleLinks(role);
  const { unmount } = render(
    <NavbarClient
      commonLinks={COMMON_LINKS}
      roleLinks={roleLinks}
      showLogout={showLogout}
    />
  );
  return unmount;
}

/**
 * Collect all visible link labels and button labels from the rendered navbar.
 * We look at <a> elements (links) and <button> elements for Logout.
 */
function getVisibleLabels(): string[] {
  const links = screen
    .getAllByRole("link")
    .map((el) => el.textContent?.trim() ?? "");
  const buttons = screen
    .queryAllByRole("button")
    .map((el) => el.textContent?.trim() ?? "");
  return [...links, ...buttons].filter(Boolean);
}

// ---------------------------------------------------------------------------
// Property 37 — Role-Appropriate Navigation Links
// ---------------------------------------------------------------------------

describe("Property 37: Role-Appropriate Navigation Links", () => {
  // ── Logic layer tests (resolveRoleLinks) ──────────────────────────────────

  describe("resolveRoleLinks logic", () => {
    it("Req 23.2 — member role yields Dashboard link and showLogout=true", () => {
      fc.assert(
        fc.property(fc.constant("member" as UserRole), (role) => {
          const { roleLinks, showLogout } = resolveRoleLinks(role);
          const labels = roleLinks.map((l) => l.label);

          expect(labels).toContain("Dashboard");
          expect(showLogout).toBe(true);
        })
      );
    });

    it("Req 23.3 — admin role yields Admin Panel link and showLogout=true", () => {
      fc.assert(
        fc.property(fc.constant("admin" as UserRole), (role) => {
          const { roleLinks, showLogout } = resolveRoleLinks(role);
          const labels = roleLinks.map((l) => l.label);

          expect(labels).toContain("Admin Panel");
          expect(showLogout).toBe(true);
        })
      );
    });

    it("Req 23.3 — super_admin role yields Admin Panel link and showLogout=true", () => {
      fc.assert(
        fc.property(fc.constant("super_admin" as UserRole), (role) => {
          const { roleLinks, showLogout } = resolveRoleLinks(role);
          const labels = roleLinks.map((l) => l.label);

          expect(labels).toContain("Admin Panel");
          expect(showLogout).toBe(true);
        })
      );
    });

    it("Req 23.2+23.3 — no authenticated role yields Login or Register in roleLinks", () => {
      fc.assert(
        fc.property(authenticatedRoleArb, (role) => {
          const { roleLinks } = resolveRoleLinks(role);
          const labels = roleLinks.map((l) => l.label);

          expect(labels).not.toContain("Login");
          expect(labels).not.toContain("Register");
        })
      );
    });

    it("member role does NOT yield Admin Panel link", () => {
      fc.assert(
        fc.property(fc.constant("member" as UserRole), (role) => {
          const { roleLinks } = resolveRoleLinks(role);
          const labels = roleLinks.map((l) => l.label);
          expect(labels).not.toContain("Admin Panel");
        })
      );
    });

    it("admin / super_admin roles do NOT yield Dashboard in roleLinks", () => {
      const adminRoles = fc.constantFrom<UserRole>("admin", "super_admin");
      fc.assert(
        fc.property(adminRoles, (role) => {
          const { roleLinks } = resolveRoleLinks(role);
          const labels = roleLinks.map((l) => l.label);
          expect(labels).not.toContain("Dashboard");
        })
      );
    });

    it("resolveRoleLinks returns the canonical MEMBER_LINKS array for member", () => {
      const { roleLinks } = resolveRoleLinks("member");
      expect(roleLinks).toStrictEqual(MEMBER_LINKS);
    });

    it("resolveRoleLinks returns the canonical ADMIN_LINKS array for admin and super_admin", () => {
      const adminRoles = fc.constantFrom<UserRole>("admin", "super_admin");
      fc.assert(
        fc.property(adminRoles, (role) => {
          const { roleLinks } = resolveRoleLinks(role);
          expect(roleLinks).toStrictEqual(ADMIN_LINKS);
        })
      );
    });

    it("guest (null) yields Login and Register in roleLinks and showLogout=false", () => {
      const { roleLinks, showLogout } = resolveRoleLinks(null);
      const labels = roleLinks.map((l) => l.label);
      expect(labels).toContain("Login");
      expect(labels).toContain("Register");
      expect(showLogout).toBe(false);
    });

    it("GUEST_LINKS are never served to authenticated roles", () => {
      const guestLabelSet = new Set(GUEST_LINKS.map((l) => l.label));
      fc.assert(
        fc.property(authenticatedRoleArb, (role) => {
          const { roleLinks } = resolveRoleLinks(role);
          const labels = roleLinks.map((l) => l.label);
          for (const guestLabel of guestLabelSet) {
            // "Book a Court" is allowed for members too — only Login/Register are forbidden
            if (guestLabel === "Login" || guestLabel === "Register") {
              expect(labels).not.toContain(guestLabel);
            }
          }
        })
      );
    });
  });

  // ── Rendering tests (NavbarClient) ────────────────────────────────────────

  describe("NavbarClient rendering", () => {
    it("Req 23.2 — member sees Dashboard and Logout but NOT Login or Register", () => {
      fc.assert(
        fc.property(fc.constant("member" as UserRole), (role) => {
          const unmount = renderNavbar(role);
          const labels = getVisibleLabels();

          expect(labels).toContain("Dashboard");
          expect(labels).toContain("Logout");
          expect(labels).not.toContain("Login");
          expect(labels).not.toContain("Register");

          unmount();
        })
      );
    });

    it("Req 23.3 — admin sees Admin Panel and Logout but NOT Login or Register", () => {
      fc.assert(
        fc.property(fc.constant("admin" as UserRole), (role) => {
          const unmount = renderNavbar(role);
          const labels = getVisibleLabels();

          expect(labels).toContain("Admin Panel");
          expect(labels).toContain("Logout");
          expect(labels).not.toContain("Login");
          expect(labels).not.toContain("Register");

          unmount();
        })
      );
    });

    it("Req 23.3 — super_admin sees Admin Panel and Logout but NOT Login or Register", () => {
      fc.assert(
        fc.property(fc.constant("super_admin" as UserRole), (role) => {
          const unmount = renderNavbar(role);
          const labels = getVisibleLabels();

          expect(labels).toContain("Admin Panel");
          expect(labels).toContain("Logout");
          expect(labels).not.toContain("Login");
          expect(labels).not.toContain("Register");

          unmount();
        })
      );
    });

    it("Req 23.2+23.3 — no authenticated role ever renders Login or Register", () => {
      fc.assert(
        fc.property(authenticatedRoleArb, (role) => {
          const unmount = renderNavbar(role);
          const labels = getVisibleLabels();

          expect(labels).not.toContain("Login");
          expect(labels).not.toContain("Register");

          unmount();
        })
      );
    });

    it("common links (Home, Locate Us, Contact Us) are always present for every role", () => {
      fc.assert(
        fc.property(anyRoleArb, (role) => {
          const unmount = renderNavbar(role);
          const labels = getVisibleLabels();

          expect(labels).toContain("Home");
          expect(labels).toContain("Locate Us");
          expect(labels).toContain("Contact Us");

          unmount();
        })
      );
    });
  });
});
