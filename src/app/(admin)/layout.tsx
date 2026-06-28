import type { Metadata } from "next";
import Box from "@mui/material/Box";
import AdminSidebar from "@/components/layout/AdminSidebar";

export const metadata: Metadata = {
  title: {
    default: "Admin Panel — Sky Court",
    template: "%s | Admin — Sky Court",
  },
  description: "Sky Court administration panel.",
};

/**
 * Admin route group layout.
 *
 * Wraps every page under (admin) with a two-column flex layout:
 *   - Left:  AdminSidebar (240 px, sticky)
 *   - Right: Main content area (flex-1)
 *
 * This is a React Server Component — no client-side interactivity here.
 * The (admin) route group is protected by middleware (Requirement 6.2).
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100vh",
        bgcolor: "background.default",
      }}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Persistent sidebar — server component with role-aware links        */}
      {/* ------------------------------------------------------------------ */}
      <Box
        component="aside"
        sx={{
          width: 240,
          flexShrink: 0,
          position: "sticky",
          top: 0,
          height: "100vh",
          overflowY: "auto",
          // Hide sidebar on very small screens (mobile)
          display: { xs: "none", md: "block" },
        }}
      >
        <AdminSidebar />
      </Box>

      {/* ------------------------------------------------------------------ */}
      {/* Main content                                                        */}
      {/* ------------------------------------------------------------------ */}
      <Box
        component="main"
        sx={{
          flex: 1,
          minWidth: 0,
          overflowX: "hidden",
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
