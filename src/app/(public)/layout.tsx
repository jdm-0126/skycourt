import { redirect } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Maintenance mode guard for all public routes
//
// Runs in the Node.js runtime (server component) — safe to query Supabase.
// Admins and super_admins bypass maintenance mode so they can still manage
// the site while it is offline for guests and members.
//
// The /maintenance route is rendered outside the (public) group so this
// layout never wraps it, preventing an infinite redirect loop.
// ---------------------------------------------------------------------------

async function getMaintenanceAndRole(): Promise<{
  maintenance: boolean;
  role: string | null;
}> {
  try {
    const supabase = await createClient();

    const [{ data: userData }, { data: settingData }] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from("system_settings")
        .select("value")
        .eq("key", "maintenance_mode")
        .maybeSingle<{ value: string }>(),
    ]);

    const role =
      ((userData.user?.app_metadata?.role ?? userData.user?.user_metadata?.role) as string | undefined) ?? null;
    const maintenance = settingData?.value === "true";

    return { maintenance, role };
  } catch {
    // DB unreachable — fail open (allow access).
    return { maintenance: false, role: null };
  }
}

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { maintenance, role } = await getMaintenanceAndRole();

  const isAdmin = role === "admin" || role === "super_admin";

  if (maintenance && !isAdmin) {
    redirect("/maintenance");
  }

  return (
    <>
      <Navbar />
      {children}
      <Footer />
    </>
  );
}
