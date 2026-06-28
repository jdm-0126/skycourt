/**
 * Shared helpers for Sky Court E2E tests.
 *
 * All tests that touch Supabase data use a unique email suffix so runs are
 * isolated even if the database is not cleaned between runs.
 */

import { type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Email helpers
// ---------------------------------------------------------------------------

/** Generate a unique test email to avoid collisions between test runs. */
export function uniqueEmail(prefix = "testuser"): string {
  return `${prefix}+e2e_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
}

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

/** Navigate to a page and wait for the network to settle. */
export async function goto(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/**
 * Fill in and submit the registration form.
 * Returns immediately after the success state renders.
 */
export async function registerUser(
  page: Page,
  {
    fullName,
    email,
    password,
  }: { fullName: string; email: string; password: string }
): Promise<void> {
  await goto(page, "/auth/register");
  await page.fill("#fullName", fullName);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
}

/**
 * Fill in and submit the login form.
 * Does NOT wait for redirect — callers can assert whatever they need.
 */
export async function loginUser(
  page: Page,
  { email, password }: { email: string; password: string }
): Promise<void> {
  await goto(page, "/auth/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
}
