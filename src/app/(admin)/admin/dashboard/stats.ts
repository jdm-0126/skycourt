/**
 * Admin dashboard data-fetching helpers.
 *
 * Extracted into a separate module so they can be unit-tested and
 * property-tested independently of the React Server Component render.
 */

import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DashboardStats = {
  todayBookingsCount: number;
  activeMembersCount: number;
  availableCourtsCount: number;
};

// ---------------------------------------------------------------------------
// fetchDashboardStats
//
// Queries:
//   1. bookings WHERE booking_date = TODAY AND status IN ('pending','confirmed')
//   2. users    WHERE role = 'member' AND status = 'active'
//   3. courts   WHERE status = 'available'
//
// Requirements: 10.1
// ---------------------------------------------------------------------------

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const supabase = await createClient();
  const todayStr = new Date().toISOString().slice(0, 10);

  // Today's bookings (pending + confirmed)
  const { count: todayBookingsCount } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("booking_date", todayStr)
    .in("status", ["pending", "confirmed"]);

  // Active members (role = member, status = active)
  const { count: activeMembersCount } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("role", "member")
    .eq("status", "active");

  // Available courts
  const { count: availableCourtsCount } = await supabase
    .from("courts")
    .select("id", { count: "exact", head: true })
    .eq("status", "available");

  return {
    todayBookingsCount: todayBookingsCount ?? 0,
    activeMembersCount: activeMembersCount ?? 0,
    availableCourtsCount: availableCourtsCount ?? 0,
  };
}
