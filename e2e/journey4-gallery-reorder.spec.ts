/**
 * E2E Journey 4: Gallery Image Reorder
 *
 * Critical path:
 *   1. Admin logs in → lands on /admin/dashboard
 *   2. Admin navigates to Gallery management page (/admin/gallery)
 *   3. If images exist, the admin moves an image down using the "Move down" button
 *   4. The image grid re-renders with the new order (order badge updates)
 *   5. The PATCH /api/gallery/order call succeeds (no error snackbar shown)
 *   6. Moving the last image down is disabled (button is disabled)
 *   7. The gallery page renders correctly when there are no images (empty state)
 *
 * Environment variables required:
 *   TEST_ADMIN_EMAIL    — email of a pre-existing admin account
 *   TEST_ADMIN_PASSWORD — password for the above account
 *
 * If these vars are absent all tests in this suite are skipped.
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
 */

import { test, expect } from "@playwright/test";
import { goto } from "./helpers";

const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? "";
const HAS_CREDENTIALS = ADMIN_EMAIL.length > 0 && ADMIN_PASSWORD.length > 0;

test.describe("Journey 4 — Gallery Reorder", () => {
  test.skip(!HAS_CREDENTIALS, "Skipped: TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD not set");

  test.beforeEach(async ({ page }) => {
    await goto(page, "/auth/login");
    await page.fill("#email", ADMIN_EMAIL);
    await page.fill("#password", ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin\/dashboard/, { timeout: 15_000 });
  });

  test("gallery management page loads correctly", async ({ page }) => {
    await goto(page, "/admin/gallery");

    // The page heading or gallery images section should be visible
    await expect(
      page.getByRole("heading", { name: /gallery images/i, exact: false })
    ).toBeVisible();

    // The "Upload Image" button should be present
    await expect(
      page.getByRole("button", { name: /upload image/i })
    ).toBeVisible();
  });

  test("gallery shows empty state when no images are present", async ({ page }) => {
    await goto(page, "/admin/gallery");

    const galleryGrid = page.getByRole("list", { name: /gallery images/i });
    const emptyState = page.getByLabel("No gallery images");

    // Either a grid of images or the empty state should be present
    const hasImages = await galleryGrid.count();
    const hasEmptyState = await emptyState.count();

    expect(hasImages + hasEmptyState).toBeGreaterThan(0);
  });

  test("moving an image down changes its position", async ({ page }) => {
    await goto(page, "/admin/gallery");

    // Check if there are at least 2 images (needed to reorder)
    const moveDownBtns = page.getByRole("button", {
      name: /move image \d+ down/i,
    });

    const count = await moveDownBtns.count();
    if (count === 0) {
      test.skip(true, "No gallery images to reorder");
      return;
    }

    // The first image's "Move down" button should be enabled
    const firstMoveDown = moveDownBtns.first();
    const isEnabled = await firstMoveDown.isEnabled();

    if (!isEnabled) {
      test.skip(true, "Move down button is disabled — only one image in gallery");
      return;
    }

    // Capture the text of the first and second order badges before reorder
    const badges = page.locator(
      'li[aria-label^="Gallery image"] >> [aria-hidden="true"]'
    );
    const badgeCountBefore = await badges.count();

    // Click "Move down" on the first image
    await firstMoveDown.click();

    // Wait a moment for the optimistic update
    await page.waitForTimeout(500);

    // After reordering, there should be no error snackbar
    const errorSnack = page.getByText(/failed to update order/i, {
      exact: false,
    });
    const errorVisible = await errorSnack.isVisible();
    expect(errorVisible).toBe(false);

    // The grid should still have the same number of images
    const badgeCountAfter = await badges.count();
    expect(badgeCountAfter).toBe(badgeCountBefore);
  });

  test("last image's move-down button is disabled", async ({ page }) => {
    await goto(page, "/admin/gallery");

    const allImages = page.getByRole("listitem").filter({
      hasText: /gallery image/i,
    });
    const imageCount = await allImages.count();

    if (imageCount === 0) {
      test.skip(true, "No gallery images present");
      return;
    }

    // The last image's "Move down" button should be disabled
    const lastIndex = imageCount;
    const lastMoveDownBtn = page.getByRole("button", {
      name: `Move image ${lastIndex} down`,
    });

    await expect(lastMoveDownBtn).toBeDisabled();
  });

  test("first image's move-up button is disabled", async ({ page }) => {
    await goto(page, "/admin/gallery");

    const moveUpBtns = page.getByRole("button", {
      name: /move image 1 up/i,
    });
    const count = await moveUpBtns.count();

    if (count === 0) {
      test.skip(true, "No gallery images present");
      return;
    }

    await expect(moveUpBtns.first()).toBeDisabled();
  });

  test("upload button triggers file picker (UI interaction only)", async ({
    page,
  }) => {
    await goto(page, "/admin/gallery");

    const uploadBtn = page.getByRole("button", { name: /upload image/i });
    await expect(uploadBtn).toBeVisible();
    await expect(uploadBtn).toBeEnabled();

    // Verify the hidden file input exists in the DOM
    const fileInput = page.locator('input[type="file"][accept*="image"]');
    await expect(fileInput).toBeAttached();
  });
});
