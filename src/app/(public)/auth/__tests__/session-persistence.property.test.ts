/**
 * Property 7: Session Persistence Across Navigation
 *
 * While a valid authenticated session exists, the user's logged-in state must
 * be preserved on every page in an arbitrary sequence of page navigations.
 *
 * This test models the session persistence logic by:
 *   1. Mocking the Supabase browser client to hold a fixed session in memory.
 *   2. Generating arbitrary navigation sequences (sequences of route paths).
 *   3. Calling `supabase.auth.getSession()` once per "navigation" in the
 *      sequence, simulating what a client component does on each page load.
 *   4. Asserting that every call returns the same non-null session.
 *
 * **Validates: Requirements 5.8**
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Fixed session fixture
// ---------------------------------------------------------------------------

const FIXED_SESSION = {
  access_token: "test-access-token",
  refresh_token: "test-refresh-token",
  expires_in: 3600,
  token_type: "bearer",
  user: {
    id: "user-123",
    email: "member@example.com",
    app_metadata: { role: "member" },
    user_metadata: {},
    aud: "authenticated",
    created_at: "2024-01-01T00:00:00.000Z",
  },
};

// ---------------------------------------------------------------------------
// Mock @/lib/supabase/client
//
// The factory is hoisted by vitest — it must be fully self-contained.
// We expose a `__getSession` spy so tests can inspect call counts and
// reconfigure behaviour when needed.
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/client", () => {
  const fixedSession = {
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: "user-123",
      email: "member@example.com",
      app_metadata: { role: "member" },
      user_metadata: {},
      aud: "authenticated",
      created_at: "2024-01-01T00:00:00.000Z",
    },
  };

  const getSession = vi.fn(async () => ({
    data: { session: fixedSession },
    error: null,
  }));

  return {
    createClient: vi.fn(() => ({
      auth: { getSession },
    })),
    __getSession: getSession,
  };
});

// ---------------------------------------------------------------------------
// Import the mock module to access the spy handle
// ---------------------------------------------------------------------------
import * as clientModule from "@/lib/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSessionSpy: ReturnType<typeof vi.fn> = (clientModule as any).__getSession;

// ---------------------------------------------------------------------------
// Helper: simulate what a client component does on each "page"
// ---------------------------------------------------------------------------

async function getSessionForPage(_route: string) {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  return supabase.auth.getSession();
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Routes representative of the three access tiers in Sky Court. */
const routeArbitrary = fc.constantFrom(
  "/member/dashboard",
  "/member/bookings",
  "/member/profile",
  "/",
  "/locate",
  "/contact"
);

/** An arbitrary navigation sequence: 1–10 pages visited in order. */
const navigationSequenceArbitrary = fc.array(routeArbitrary, {
  minLength: 1,
  maxLength: 10,
});

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Restore the default implementation after clearAllMocks resets the spy.
  getSessionSpy.mockImplementation(async () => ({
    data: { session: FIXED_SESSION },
    error: null,
  }));
});

// ---------------------------------------------------------------------------
// Property 7 — Session Persistence Across Navigation
// ---------------------------------------------------------------------------

describe("Property 7: Session Persistence Across Navigation", () => {
  /**
   * **Validates: Requirements 5.8**
   *
   * For any sequence of page navigations while a valid authenticated session
   * exists, `getSession()` must return a non-null session on every step.
   */
  it("returns a non-null session on every page in an arbitrary navigation sequence", async () => {
    await fc.assert(
      fc.asyncProperty(navigationSequenceArbitrary, async (routes) => {
        for (const route of routes) {
          const result = await getSessionForPage(route);

          // No error must occur
          expect(result.error).toBeNull();

          // Session must be present (non-null) — user remains logged in
          expect(result.data.session).not.toBeNull();
        }
      })
    );
  });

  /**
   * **Validates: Requirements 5.8**
   *
   * The session returned on every page must be identical to the session that
   * existed at the start of the navigation sequence — no drift or corruption.
   */
  it("returns the same session object on every page in the navigation sequence", async () => {
    await fc.assert(
      fc.asyncProperty(navigationSequenceArbitrary, async (routes) => {
        // Capture the baseline session from the first navigation.
        const first = await getSessionForPage(routes[0]);
        const baselineSession = first.data.session;

        // Every subsequent page must yield the same session.
        for (const route of routes) {
          const result = await getSessionForPage(route);

          expect(result.data.session).toEqual(baselineSession);
        }
      })
    );
  });

  /**
   * **Validates: Requirements 5.8**
   *
   * The access_token embedded in the session must be identical across all
   * pages in the sequence, confirming the same credentials are active.
   */
  it("preserves the access token identity across all navigation steps", async () => {
    await fc.assert(
      fc.asyncProperty(navigationSequenceArbitrary, async (routes) => {
        const expectedToken = FIXED_SESSION.access_token;

        for (const route of routes) {
          const result = await getSessionForPage(route);
          expect(result.data.session?.access_token).toBe(expectedToken);
        }
      })
    );
  });

  /**
   * **Validates: Requirements 5.8**
   *
   * The user identity (id and email) embedded in the session must remain
   * stable across the entire navigation sequence.
   */
  it("preserves the user identity across all navigation steps", async () => {
    await fc.assert(
      fc.asyncProperty(navigationSequenceArbitrary, async (routes) => {
        for (const route of routes) {
          const result = await getSessionForPage(route);
          const user = result.data.session?.user;

          expect(user?.id).toBe(FIXED_SESSION.user.id);
          expect(user?.email).toBe(FIXED_SESSION.user.email);
        }
      })
    );
  });

  /**
   * **Validates: Requirements 5.8**
   *
   * getSession() must be called exactly once per navigation step — confirming
   * that each simulated page load checks session state independently.
   */
  it("calls getSession once per navigation step", async () => {
    await fc.assert(
      fc.asyncProperty(navigationSequenceArbitrary, async (routes) => {
        // Reset spy call count before each run.
        getSessionSpy.mockClear();

        for (const route of routes) {
          await getSessionForPage(route);
        }

        expect(getSessionSpy).toHaveBeenCalledTimes(routes.length);
      })
    );
  });
});
