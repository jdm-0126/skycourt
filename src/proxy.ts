import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Route protection configuration
// ---------------------------------------------------------------------------

type Role = "member" | "admin" | "super_admin";

/** Routes that require authentication and the minimum role(s) allowed. */
const PROTECTED_ROUTES: Array<{ prefix: string; allowedRoles: Role[] }> = [
  // Most permissive first — order matters for prefix matching
  // Booking pages are intentionally NOT listed here — guests can browse them
  // but the API will reject unauthenticated submission (401).
  { prefix: "/member/dashboard", allowedRoles: ["member", "admin", "super_admin"] },
  { prefix: "/member/profile",   allowedRoles: ["member", "admin", "super_admin"] },
  { prefix: "/admin",            allowedRoles: ["admin", "super_admin"] },
  { prefix: "/superadmin",       allowedRoles: ["super_admin"] },
];

/** Booking paths that are publicly browsable but require member login to submit. */
const PUBLIC_BOOKING_PREFIXES = [
  "/member/bookings",
];

function getProtectedRoute(
  pathname: string
): (typeof PROTECTED_ROUTES)[number] | null {
  // More specific prefixes should win — sort by descending length
  const sorted = [...PROTECTED_ROUTES].sort(
    (a, b) => b.prefix.length - a.prefix.length
  );
  for (const route of sorted) {
    if (pathname === route.prefix || pathname.startsWith(route.prefix + "/")) {
      return route;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Guard: if env vars are missing (e.g. during build-time static analysis)
  // just pass the request through rather than crashing the edge function.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({ request });
  }

  // Build a mutable response that Supabase can attach refreshed cookies to.
  let supabaseResponse = NextResponse.next({ request });

  // Create a Supabase client that reads / writes cookies via the middleware
  // request/response pair — the only safe pattern at the Edge.
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[]
      ) {
        // First apply to the request so the rest of this function sees them.
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        // Re-create the response so all set-cookies make it to the client.
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANT: getUser() must be called to trigger the session refresh logic
  // inside @supabase/ssr.  Do NOT remove this call even if `user` is unused
  // in some branches.
  //
  // Wrapped in try/catch so a transient auth-server failure never crashes
  // the edge function — we fail open (unauthenticated) and let the protected
  // route check redirect to login if needed.
  let user: { app_metadata?: Record<string, unknown> } | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Auth service unreachable — treat as unauthenticated.
  }

  // Role is written to user_metadata during signUp (client-side) and ideally
  // promoted to app_metadata by a DB trigger.  Until the trigger is in place,
  // fall back to user_metadata so that newly registered members and admins
  // created via the admin API are not incorrectly redirected to /403.
  const userAny = user as Record<string, unknown> | null;
  const appMetaRole = (userAny?.app_metadata as Record<string, unknown> | undefined)?.role;
  const userMetaRole = (userAny?.user_metadata as Record<string, unknown> | undefined)?.role;
  const role = ((appMetaRole ?? userMetaRole) ?? null) as Role | null;

  // -------------------------------------------------------------------------
  // Maintenance mode — handled at the page/layout level (server components),
  // NOT here in the edge middleware.  Doing a DB query on every edge request
  // is fragile and can cause MIDDLEWARE_INVOCATION_FAILURE on cold starts.
  //
  // The root layout server component reads the maintenance_mode setting and
  // redirects guests/members to /maintenance when it is enabled.
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Protected routes — authentication & role enforcement
  // -------------------------------------------------------------------------
  const protectedRoute = getProtectedRoute(pathname);

  if (protectedRoute) {
    // 2a. Unauthenticated → redirect to /auth/login
    if (!user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/auth/login";
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // 2b. Wrong role → redirect to /403
    if (!role || !protectedRoute.allowedRoles.includes(role)) {
      const forbiddenUrl = request.nextUrl.clone();
      forbiddenUrl.pathname = "/403";
      return NextResponse.redirect(forbiddenUrl);
    }
  }

  // -------------------------------------------------------------------------
  // Pass through — return the (potentially cookie-refreshed) response
  // -------------------------------------------------------------------------
  return supabaseResponse;
}

// ---------------------------------------------------------------------------
// Matcher — scope middleware to routes that need it.
// Excludes Next.js internals, static assets, and API routes that handle
// their own auth.
// ---------------------------------------------------------------------------
export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     *  - _next/static  (static files)
     *  - _next/image   (image optimisation)
     *  - favicon.ico
     *  - Files with a file extension (images, fonts, etc.)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf|eot)).*)",
  ],
};
