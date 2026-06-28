/**
 * Property-based tests for Edge Middleware route protection.
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
 *
 * Property 8: Unauthenticated Users Redirected from Protected Routes
 *   For any request to a protected route (member, admin, or super_admin) by an
 *   unauthenticated user, the system must redirect the request to the login page
 *   and must not serve the protected content.
 *
 * Property 9: Role-Based Access Control Enforcement
 *   For any admin- or super_admin-protected route, a request authenticated as
 *   role = 'member' must receive a 403 Forbidden response.
 *   For any super_admin-only route, a request authenticated as role = 'admin'
 *   must receive a 403 Forbidden response.
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// vi.mock calls are hoisted to the top of the file by vitest — the factory
// function MUST be self-contained (no references to variables declared below).
// ---------------------------------------------------------------------------

/**
 * Mock next/server with lightweight fakes that satisfy the middleware's usage
 * pattern without needing the actual Edge Runtime environment.
 *
 * The middleware uses:
 *   - NextResponse.next({ request })    → returns a "pass through" response
 *   - NextResponse.redirect(url)        → returns a redirect response
 *   - request.nextUrl.clone()           → returns a mutable URL copy
 *   - request.nextUrl.pathname          → route path string
 *   - request.cookies.getAll()          → returns [] (no cookies in tests)
 */
vi.mock("next/server", () => {
  class MockHeaders extends Map<string, string> {
    get(key: string): string | undefined {
      return super.get(key.toLowerCase()) ?? undefined;
    }
    set(key: string, value: string): this {
      return super.set(key.toLowerCase(), value);
    }
  }

  class MockResponse {
    status: number;
    headers: MockHeaders;

    constructor(status = 200) {
      this.status = status;
      this.headers = new MockHeaders();
    }

    static redirect(url: { toString(): string } | string, status = 307): MockResponse {
      const res = new MockResponse(status);
      res.headers.set("location", typeof url === "string" ? url : url.toString());
      return res;
    }

    static next(_opts?: unknown): MockResponse {
      return new MockResponse(200);
    }
  }

  class MockNextUrl {
    pathname: string;
    searchParams: URLSearchParams;
    private _origin: string;

    constructor(input: string) {
      const u = new URL(input);
      this._origin = u.origin;
      this.pathname = u.pathname;
      this.searchParams = u.searchParams;
    }

    clone(): MockNextUrl {
      const cloned = new MockNextUrl(`${this._origin}${this.pathname}`);
      // Copy existing search params
      this.searchParams.forEach((v, k) => cloned.searchParams.set(k, v));
      return cloned;
    }

    toString(): string {
      const qs = this.searchParams.toString();
      return `${this._origin}${this.pathname}${qs ? `?${qs}` : ""}`;
    }
  }

  class MockRequest {
    nextUrl: MockNextUrl;
    cookies: { getAll(): [] };

    constructor(url: string) {
      this.nextUrl = new MockNextUrl(url);
      this.cookies = { getAll() { return []; } };
    }
  }

  return {
    NextRequest: MockRequest,
    NextResponse: MockResponse,
  };
});

// ---------------------------------------------------------------------------
// Mock @supabase/ssr with a controllable getUser stub.
// The factory uses vi.fn() which is available in the hoisted context.
// ---------------------------------------------------------------------------

vi.mock("@supabase/ssr", () => {
  const mockGetUser = vi.fn();
  const mockSingle = vi.fn();

  const fromChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: mockSingle,
  };

  return {
    createServerClient: vi.fn(() => ({
      auth: { getUser: mockGetUser },
      from: vi.fn(() => fromChain),
    })),
    // Expose the mocks so tests can configure them
    __mockGetUser: mockGetUser,
    __mockSingle: mockSingle,
    __fromChain: fromChain,
  };
});

// ---------------------------------------------------------------------------
// Import the module under test and the exposed mock handles AFTER vi.mock.
// ---------------------------------------------------------------------------
import { proxy } from "../../proxy";
import * as supabaseSsrMock from "@supabase/ssr";

// Access the exposed mock handles
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ssrMock = supabaseSsrMock as any;
const mockGetUser: ReturnType<typeof vi.fn> = ssrMock.__mockGetUser;
const mockSingle: ReturnType<typeof vi.fn> = ssrMock.__mockSingle;
const mockFromChain = ssrMock.__fromChain;

// ---------------------------------------------------------------------------
// Import the fake NextRequest so we can construct requests in tests.
// ---------------------------------------------------------------------------
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FakeNextRequest = InstanceType<typeof NextRequest>;

function makeRequest(pathname: string): FakeNextRequest {
  return new NextRequest(`http://localhost${pathname}` as unknown as Request);
}

function mockUnauthenticated() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
}

function mockAuthenticated(role: string) {
  mockGetUser.mockResolvedValue({
    data: {
      user: {
        id: "test-user-id",
        app_metadata: { role },
        user_metadata: {},
        aud: "authenticated",
        email: "test@example.com",
      },
    },
    error: null,
  });
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Re-stub chaining after clearAllMocks (mockReturnThis loses its value)
  mockFromChain.select.mockReturnThis();
  mockFromChain.eq.mockReturnThis();

  // Maintenance mode off by default — prevents the maintenance branch from
  // interfering with route protection tests.
  mockSingle.mockResolvedValue({ data: { value: "false" }, error: null });

  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
});

// ---------------------------------------------------------------------------
// Utility to extract the Location header from a response
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getLocation(response: any): string | undefined {
  return response.headers?.get?.("location") ?? undefined;
}

// ---------------------------------------------------------------------------
// Property 8 — Unauthenticated Users Redirected from Protected Routes
// ---------------------------------------------------------------------------

describe("Property 8: Unauthenticated users are redirected from protected routes", () => {
  /**
   * **Validates: Requirements 6.1**
   *
   * For any protected path, an unauthenticated request must receive a redirect
   * to /auth/login. The protected content must never be served.
   */
  it("redirects to /auth/login for any protected path when user is not authenticated", async () => {
    mockUnauthenticated();

    const protectedPaths = fc.constantFrom(
      "/member/dashboard",
      "/admin/bookings",
      "/superadmin/admins",
      "/member/profile",
      "/admin/courts"
    );

    await fc.assert(
      fc.asyncProperty(protectedPaths, async (pathname) => {
        const request = makeRequest(pathname);
        const response = await proxy(request);

        // Must be a redirect (3xx)
        expect(response.status).toBeGreaterThanOrEqual(300);
        expect(response.status).toBeLessThan(400);

        const location = getLocation(response);
        expect(location).not.toBeUndefined();
        expect(location).toContain("/auth/login");
      })
    );
  });

  it("includes the original path as the redirect query param", async () => {
    mockUnauthenticated();

    const protectedPaths = fc.constantFrom(
      "/member/dashboard",
      "/admin/bookings",
      "/superadmin/admins",
      "/member/profile",
      "/admin/courts"
    );

    await fc.assert(
      fc.asyncProperty(protectedPaths, async (pathname) => {
        const request = makeRequest(pathname);
        const response = await proxy(request);

        const location = getLocation(response);
        expect(location).not.toBeUndefined();

        // ?redirect=<pathname> must be present in the Location URL
        const redirectUrl = new URL(location!);
        expect(redirectUrl.searchParams.get("redirect")).toBe(pathname);
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9 — Role-Based Access Control Enforcement
// ---------------------------------------------------------------------------

describe("Property 9a: Member role is forbidden from admin/superadmin routes", () => {
  /**
   * **Validates: Requirements 6.2, 6.3**
   *
   * For any admin- or super_admin-protected route, a request authenticated as
   * role = 'member' must receive a redirect to /403.
   */
  it("redirects member to /403 for any admin or superadmin route", async () => {
    mockAuthenticated("member");

    const adminOrSuperAdminPaths = fc.constantFrom(
      "/admin/dashboard",
      "/admin/bookings",
      "/superadmin/admins"
    );

    await fc.assert(
      fc.asyncProperty(adminOrSuperAdminPaths, async (pathname) => {
        const request = makeRequest(pathname);
        const response = await proxy(request);

        // Must be a redirect
        expect(response.status).toBeGreaterThanOrEqual(300);
        expect(response.status).toBeLessThan(400);

        const location = getLocation(response);
        expect(location).not.toBeUndefined();
        expect(location).toContain("/403");
      })
    );
  });
});

describe("Property 9b: Admin role is forbidden from superadmin-only routes", () => {
  /**
   * **Validates: Requirements 6.4**
   *
   * For any super_admin-only route, a request authenticated as role = 'admin'
   * must receive a redirect to /403.
   */
  it("redirects admin to /403 for any superadmin-only route", async () => {
    mockAuthenticated("admin");

    const superAdminOnlyPaths = fc.constantFrom(
      "/superadmin/admins",
      "/superadmin/roles",
      "/superadmin/audit-logs"
    );

    await fc.assert(
      fc.asyncProperty(superAdminOnlyPaths, async (pathname) => {
        const request = makeRequest(pathname);
        const response = await proxy(request);

        // Must be a redirect
        expect(response.status).toBeGreaterThanOrEqual(300);
        expect(response.status).toBeLessThan(400);

        const location = getLocation(response);
        expect(location).not.toBeUndefined();
        expect(location).toContain("/403");
      })
    );
  });
});

describe("Property 9c: Member role can access member routes (no redirect)", () => {
  /**
   * **Validates: Requirements 6.1**
   *
   * A request authenticated as role = 'member' for a member-only route must
   * NOT be redirected — the protected content must be served.
   */
  it("allows members to access member-only routes without redirect", async () => {
    mockAuthenticated("member");

    const memberPaths = fc.constantFrom(
      "/member/dashboard",
      "/member/profile",
      "/member/bookings/new"
    );

    await fc.assert(
      fc.asyncProperty(memberPaths, async (pathname) => {
        const request = makeRequest(pathname);
        const response = await proxy(request);

        const location = getLocation(response);
        const isBlockingRedirect =
          location?.includes("/auth/login") || location?.includes("/403");

        expect(isBlockingRedirect).toBeFalsy();
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Regression guards: elevated roles must not be blocked from lower-tier routes
// ---------------------------------------------------------------------------

describe("Elevated roles can access member routes", () => {
  it("allows admin role to access member routes", async () => {
    mockAuthenticated("admin");

    const memberPaths = fc.constantFrom(
      "/member/dashboard",
      "/member/profile"
    );

    await fc.assert(
      fc.asyncProperty(memberPaths, async (pathname) => {
        const request = makeRequest(pathname);
        const response = await proxy(request);

        const location = getLocation(response);
        const isBlockingRedirect =
          location?.includes("/auth/login") || location?.includes("/403");

        expect(isBlockingRedirect).toBeFalsy();
      })
    );
  });

  it("allows super_admin role to access member, admin, and superadmin routes", async () => {
    mockAuthenticated("super_admin");

    const allProtectedPaths = fc.constantFrom(
      "/member/dashboard",
      "/admin/bookings",
      "/superadmin/admins"
    );

    await fc.assert(
      fc.asyncProperty(allProtectedPaths, async (pathname) => {
        const request = makeRequest(pathname);
        const response = await proxy(request);

        const location = getLocation(response);
        const isBlockingRedirect =
          location?.includes("/auth/login") || location?.includes("/403");

        expect(isBlockingRedirect).toBeFalsy();
      })
    );
  });
});
