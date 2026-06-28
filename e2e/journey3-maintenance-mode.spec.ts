/**
 * E2E Journey 3: Maintenance Mode Toggle
 *
 * Critical path:
 *   1. Super Admin logs in → lands on /admin/dashboard
 *   2. Super Admin navigates to Website Settings (/superadmin/website-settings)
 *   3. Maintenance mode switch is toggled ON and saved
 *   4. Public pages redirect to /maintenance for guest users
 *   5. Super Admin can toggle maintenance mode OFF
 *   6. Public pages become accessible again
 *
 * Environment variables required:
 *   TEST_SUPERADMIN_EMAIL    — email of a pre-existing super_admin account
 *   TEST_SUPERADMIN_PASSWORD — password for the above account
 *
 * If these vars are absent all tests in this suite are skipped.
 *
 * NOTE: This test deliberately restores maintenance_mode=false at the end
 * to avoid leaving the site in a broken state for other test runs.
 *
 * Requirements: 22.1, 22.2, 22.3
 */

import { test, expect } from "@playwright/test";
import { goto } from "./helpers";

const SA_EMAIL = process.env.TEST_SUPERADMIN_EMAIL ?? "";
const SA_PASSWORD = process.env.TEST_SUPERADMIN_PASSWORD ?? "";
const HAS_CREDENTIALS = SA_EMAIL.length > 0 && SA_PASSWORD.length > 0;

test.describe("Journey 3 — Maintenance Mode", () => {
  test.skip(!HAS_CREDENTIALS, "Skipped: TEST_SUPERADMIN_EMAIL / TEST_SUPERADMIN_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    await goto(page, "/auth/login");
    await page.fill("#email", SA_EMAIL);
    await page.fill("#password", SA_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin\/dashboard/, { timeout: 15_000 });
  });

  test("super admin can access website settings page", async ({ page }) => {
    await goto(page, "/superadmin/website-settings");

    // The form for system settings should render
    await expect(
      page.getByRole("form", { name: /system settings/i })
    ).toBeVisible();

    // Maintenance mode switch should be present
    await expect(
      page.getByRole("checkbox", { name: /toggle maintenance mode/i })
    ).toBeVisible();
  });

  test("super admin sidebar shows extended links", async ({ page }) => {
    // Super admin should see standard AND extended sidebar links (Req 23.6)
    const superAdminLinks = [
      "Admins",
      "Roles",
      "Audit Logs",
      "Website Settings",
    ];
    for (const label of superAdminLinks) {
      await expect(
        page.getByRole("link", { name: label, exact: false })
      ).toBeVisible();
    }
  });

  test(
    "enabling maintenance mode redirects public users to /maintenance",
    async ({ page, context }) => {
      // ---- Enable maintenance mode ----
      await goto(page, "/superadmin/website-settings");

      const maintenanceSwitch = page.getByRole("checkbox", {
        name: /toggle maintenance mode/i,
      });

      // Only toggle if currently OFF
      const isChecked = await maintenanceSwitch.isChecked();
      if (!isChecked) {
        await maintenanceSwitch.click();
        await page.getByRole("button", { name: /save settings/i }).click();
        await expect(
          page.getByText(/saved successfully/i, { exact: false })
        ).toBeVisible({ timeout: 10_000 });
      }

      // ---- Verify public page is redirected ----
      // Open a fresh incognito-like page (no auth cookies) to simulate a guest
      const guestPage = await context.newPage();
      await guestPage.goto("/");
      await guestPage.waitForLoadState("networkidle");

      // Guest should land on maintenance page (either by redirect or direct render)
      await expect(guestPage).toHaveURL(/\/maintenance/, { timeout: 15_000 });
      await expect(
        guestPage.getByText(/under maintenance/i, { exact: false })
      ).toBeVisible();

      await guestPage.close();

      // ---- Restore: disable maintenance mode ----
      await goto(page, "/superadmin/website-settings");
      const switchAfter = page.getByRole("checkbox", {
        name: /toggle maintenance mode/i,
      });
      const isCheckedAfter = await switchAfter.isChecked();
      if (isCheckedAfter) {
        await switchAfter.click();
        await page.getByRole("button", { name: /save settings/i }).click();
        await expect(
          page.getByText(/saved successfully/i, { exact: false })
        ).toBeVisible({ timeout: 10_000 });
      }
    }
  );

  test("disabling maintenance mode restores public access", async ({
    page,
    context,
  }) => {
    // Ensure maintenance mode is OFF
    await goto(page, "/superadmin/website-settings");

    const maintenanceSwitch = page.getByRole("checkbox", {
      name: /toggle maintenance mode/i,
    });
    const isChecked = await maintenanceSwitch.isChecked();
    if (isChecked) {
      await maintenanceSwitch.click();
      await page.getByRole("button", { name: /save settings/i }).click();
      await expect(
        page.getByText(/saved successfully/i, { exact: false })
      ).toBeVisible({ timeout: 10_000 });
    }

    // Verify a guest page renders the home page, not the maintenance page
    const guestPage = await context.newPage();
    await guestPage.goto("/");
    await guestPage.waitForLoadState("networkidle");

    // Should NOT be on the maintenance page
    await expect(guestPage).not.toHaveURL(/\/maintenance/);
    await guestPage.close();
  });

  test("maintenance page renders all required content when active", async ({
    page,
  }) => {
    // Navigate directly to the maintenance page to verify its content
    await goto(page, "/maintenance");

    await expect(page.getByRole("heading", { name: /sky court/i })).toBeVisible();
    await expect(page.getByText(/under maintenance/i, { exact: false })).toBeVisible();
    await expect(page.getByText(/maintenance/i, { exact: false })).toBeVisible();
  });
});
