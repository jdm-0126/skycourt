/**
 * Property-based tests for admin panel sidebar navigation links.
 *
 * **Validates: Requirements 23.6**
 *
 * Property 38: Super Admin Sidebar Shows Extended Links
 *   For any authenticated super_admin, the admin panel sidebar must display
 *   all standard admin navigation links plus the super admin-specific links
 *   (Admins, Roles, Audit Logs, Database Backup, Website Settings).
 *
 *   Tested against the exported constants from AdminSidebar.tsx:
 *   - ADMIN_SIDEBAR_LINKS: standard links for all admin roles (Req 23.5)
 *   - SUPER_ADMIN_SIDEBAR_LINKS: extended links for super_admin only (Req 23.6)
 *
 * @vitest-environment node
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  ADMIN_SIDEBAR_LINKS,
  SUPER_ADMIN_SIDEBAR_LINKS,
} from "../AdminSidebar";

// ---------------------------------------------------------------------------
// Required link labels per requirement
// ---------------------------------------------------------------------------

/** Req 23.5 — standard admin navigation links */
const REQUIRED_ADMIN_LABELS = [
  "Dashboard",
  "Bookings",
  "Courts",
  "Website",
  "Gallery",
  "Users",
  "Reports",
  "Messages",
  "Settings",
] as const;

/** Req 23.6 — super admin-only navigation links */
const REQUIRED_SUPER_ADMIN_LABELS = [
  "Admins",
  "Roles",
  "Audit Logs",
  "Database Backup",
  "Website Settings",
] as const;

/**
 * Links that must NEVER appear in the super admin-specific list.
 * These are links for unauthenticated / member users only.
 */
const FORBIDDEN_IN_SUPER_ADMIN = [
  "Login",
  "Register",
  "Book a Court",
  "Locate Us",
  "Contact Us",
  "Home",
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collect all labels from a link array into a Set for O(1) lookup. */
function labelSet(
  links: ReadonlyArray<{ label: string }>
): Set<string> {
  return new Set(links.map((l) => l.label));
}

/** Collect all hrefs from a link array into a Set. */
function hrefSet(
  links: ReadonlyArray<{ href: string }>
): Set<string> {
  return new Set(links.map((l) => l.href));
}

// ---------------------------------------------------------------------------
// Property 38 — Super Admin Sidebar Shows Extended Links
// ---------------------------------------------------------------------------

describe("Property 38: Super Admin Sidebar Shows Extended Links", () => {
  // ── Standard admin links (Req 23.5) ─────────────────────────────────────

  describe("ADMIN_SIDEBAR_LINKS — standard links shown to all admin roles (Req 23.5)", () => {
    it("contains every required standard admin link label", () => {
      fc.assert(
        fc.property(fc.constantFrom(...REQUIRED_ADMIN_LABELS), (label) => {
          const labels = labelSet(ADMIN_SIDEBAR_LINKS);
          expect(labels.has(label)).toBe(true);
        })
      );
    });

    it("every link has a non-empty label", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: ADMIN_SIDEBAR_LINKS.length - 1 }),
          (index) => {
            const link = ADMIN_SIDEBAR_LINKS[index];
            expect(link.label).toBeTruthy();
            expect(link.label.trim().length).toBeGreaterThan(0);
          }
        )
      );
    });

    it("every link has a non-empty href starting with '/'", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: ADMIN_SIDEBAR_LINKS.length - 1 }),
          (index) => {
            const link = ADMIN_SIDEBAR_LINKS[index];
            expect(link.href).toBeTruthy();
            expect(link.href.trim().length).toBeGreaterThan(0);
            expect(link.href.startsWith("/")).toBe(true);
          }
        )
      );
    });

    it("all labels are unique within ADMIN_SIDEBAR_LINKS", () => {
      const labels = ADMIN_SIDEBAR_LINKS.map((l) => l.label);
      const uniqueLabels = new Set(labels);
      expect(uniqueLabels.size).toBe(labels.length);
    });

    it("all hrefs are unique within ADMIN_SIDEBAR_LINKS", () => {
      const hrefs = ADMIN_SIDEBAR_LINKS.map((l) => l.href);
      const uniqueHrefs = new Set(hrefs);
      expect(uniqueHrefs.size).toBe(hrefs.length);
    });
  });

  // ── Super admin-only links (Req 23.6) ────────────────────────────────────

  describe("SUPER_ADMIN_SIDEBAR_LINKS — additional links shown only to super_admin (Req 23.6)", () => {
    it("contains every required super admin-specific link label", () => {
      fc.assert(
        fc.property(fc.constantFrom(...REQUIRED_SUPER_ADMIN_LABELS), (label) => {
          const labels = labelSet(SUPER_ADMIN_SIDEBAR_LINKS);
          expect(labels.has(label)).toBe(true);
        })
      );
    });

    it("every link has a non-empty label", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: SUPER_ADMIN_SIDEBAR_LINKS.length - 1 }),
          (index) => {
            const link = SUPER_ADMIN_SIDEBAR_LINKS[index];
            expect(link.label).toBeTruthy();
            expect(link.label.trim().length).toBeGreaterThan(0);
          }
        )
      );
    });

    it("every link has a non-empty href starting with '/'", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: SUPER_ADMIN_SIDEBAR_LINKS.length - 1 }),
          (index) => {
            const link = SUPER_ADMIN_SIDEBAR_LINKS[index];
            expect(link.href).toBeTruthy();
            expect(link.href.trim().length).toBeGreaterThan(0);
            expect(link.href.startsWith("/")).toBe(true);
          }
        )
      );
    });

    it("all labels are unique within SUPER_ADMIN_SIDEBAR_LINKS", () => {
      const labels = SUPER_ADMIN_SIDEBAR_LINKS.map((l) => l.label);
      const uniqueLabels = new Set(labels);
      expect(uniqueLabels.size).toBe(labels.length);
    });

    it("all hrefs are unique within SUPER_ADMIN_SIDEBAR_LINKS", () => {
      const hrefs = SUPER_ADMIN_SIDEBAR_LINKS.map((l) => l.href);
      const uniqueHrefs = new Set(hrefs);
      expect(uniqueHrefs.size).toBe(hrefs.length);
    });

    it("does not contain forbidden guest/member-only link labels", () => {
      fc.assert(
        fc.property(fc.constantFrom(...FORBIDDEN_IN_SUPER_ADMIN), (forbidden) => {
          const labels = labelSet(SUPER_ADMIN_SIDEBAR_LINKS);
          expect(labels.has(forbidden)).toBe(false);
        })
      );
    });
  });

  // ── No overlap between the two link sets ─────────────────────────────────

  describe("ADMIN_SIDEBAR_LINKS and SUPER_ADMIN_SIDEBAR_LINKS have no overlap", () => {
    it("no label appears in both ADMIN_SIDEBAR_LINKS and SUPER_ADMIN_SIDEBAR_LINKS", () => {
      const adminLabels = labelSet(ADMIN_SIDEBAR_LINKS);
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: SUPER_ADMIN_SIDEBAR_LINKS.length - 1 }),
          (index) => {
            const superAdminLabel = SUPER_ADMIN_SIDEBAR_LINKS[index].label;
            expect(adminLabels.has(superAdminLabel)).toBe(false);
          }
        )
      );
    });

    it("no href appears in both ADMIN_SIDEBAR_LINKS and SUPER_ADMIN_SIDEBAR_LINKS", () => {
      const adminHrefs = hrefSet(ADMIN_SIDEBAR_LINKS);
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: SUPER_ADMIN_SIDEBAR_LINKS.length - 1 }),
          (index) => {
            const superAdminHref = SUPER_ADMIN_SIDEBAR_LINKS[index].href;
            expect(adminHrefs.has(superAdminHref)).toBe(false);
          }
        )
      );
    });
  });

  // ── Combined super_admin view (Req 23.5 + 23.6) ──────────────────────────

  describe("Combined super_admin navigation (all standard + all super admin-only links)", () => {
    it("the union of both link arrays contains all required labels for a super_admin", () => {
      const allRequiredLabels = [
        ...REQUIRED_ADMIN_LABELS,
        ...REQUIRED_SUPER_ADMIN_LABELS,
      ];

      const combinedLinks = [...ADMIN_SIDEBAR_LINKS, ...SUPER_ADMIN_SIDEBAR_LINKS];
      const combinedLabels = labelSet(combinedLinks);

      fc.assert(
        fc.property(fc.constantFrom(...allRequiredLabels), (label) => {
          expect(combinedLabels.has(label)).toBe(true);
        })
      );
    });

    it("the combined link list has no duplicate labels", () => {
      const combinedLinks = [...ADMIN_SIDEBAR_LINKS, ...SUPER_ADMIN_SIDEBAR_LINKS];
      const labels = combinedLinks.map((l) => l.label);
      const uniqueLabels = new Set(labels);
      expect(uniqueLabels.size).toBe(labels.length);
    });

    it("the combined link list has no duplicate hrefs", () => {
      const combinedLinks = [...ADMIN_SIDEBAR_LINKS, ...SUPER_ADMIN_SIDEBAR_LINKS];
      const hrefs = combinedLinks.map((l) => l.href);
      const uniqueHrefs = new Set(hrefs);
      expect(uniqueHrefs.size).toBe(hrefs.length);
    });
  });
});
