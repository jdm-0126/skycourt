import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Route protection configuration
// ---------------------------------------------------------------------------

type Role = "member" | "admin" | "super_admin";

/** Routes that require authentication and the minimum role(s) allowed. */
const PROTECTED_ROUTES: Array<{ prefix: string; allowedRoles: Role[] }> = [
  // Most permissive first — order matters for prefix matching
  { prefix: "/member", allowedRoles: ["member", "admin", "super_admin"] },
  { prefix: "/admin", allowedRoles: ["admin", "super_admin"] },
  { prefix: "/superadmin", allowedRoles: ["super_admin"] },
];

/**
 * Public routes that are intercepted when maintenance mode is active.
 * Auth routes are listed separately so we can always let admins through.
 */
const PUBLIC_ROUTES = ["/", "/locate", "/contact", "/auth"];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + "/")
  );
}

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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Build a mutable response that Supabase can attach refreshed cookies to.
  let supabaseResponse = NextResponse.next({ request });

  // Create a Supabase client that reads / writes cookies via the middleware
  // request/response pair — the only safe pattern at the Edge.
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    }
  );

  // IMPORTANT: getUser() must be called to trigger the session refresh logic
  // inside @supabase/ssr.  Do NOT remove this call even if `user` is unused
  // in some branches.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = (user?.app_metadata?.role ?? null) as Role | null;

  // -------------------------------------------------------------------------
  // 1. Maintenance mode — intercept public routes (except for admin/super_admin)
  // -------------------------------------------------------------------------
  if (isPublicRoute(pathname) && role !== "admin" && role !== "super_admin") {
    try {
      const { data: setting } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "maintenance_mode")
        .single<{ value: string }>();

      if (setting?.value === "true") {
        // Don't redirect if we're already on the maintenance page to avoid loops.
        if (pathname !== "/maintenance") {
          const maintenanceUrl = request.nextUrl.clone();
          maintenanceUrl.pathname = "/maintenance";
          return NextResponse.redirect(maintenanceUrl);
        }
      }
    } catch {
      // If the DB is unreachable during maintenance check, fail open (allow access).
    }
  }

  // -------------------------------------------------------------------------
  // 2. Protected routes — authentication & role enforcement
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
  // 3. Pass through — return the (potentially cookie-refreshed) response
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
