import type { Metadata } from "next";
import Box from "@mui/material/Box";
import AdminSidebar from "@/components/layout/AdminSidebar";
import Navbar from "@/components/layout/Navbar";

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
 * Structure:
 *   - Top:   Navbar (fixed, full-width) — provides mobile burger + desktop links
 *   - Below: Two-column flex row
 *       Left:  AdminSidebar (240 px, sticky, desktop only)
 *       Right: Main content area (flex-1)
 *
 * The (admin) route group is protected by middleware (Requirement 6.2).
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Navbar renders its own fixed AppBar + Toolbar spacer */}
      <Navbar />

      <Box
        sx={{
          display: "flex",
          minHeight: "calc(100vh - 64px)", // subtract AppBar height
          bgcolor: "background.default",
        }}
      >
        {/* Persistent sidebar — desktop only */}
        <Box
          component="aside"
          sx={{
            width: 240,
            flexShrink: 0,
            position: "sticky",
            top: 64, // stick below the fixed AppBar
            height: "calc(100vh - 64px)",
            overflowY: "auto",
            display: { xs: "none", md: "block" },
          }}
        >
          <AdminSidebar />
        </Box>

        {/* Main content */}
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
    </>
  );
}
