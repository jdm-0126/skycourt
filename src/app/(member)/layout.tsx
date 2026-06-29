import Box from "@mui/material/Box";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";

/**
 * Member route group layout.
 *
 * Wraps every page under (member) with the shared Navbar and Footer so
 * the navigation is always visible — including on mobile — across all
 * member pages (dashboard, bookings, profile, etc.).
 *
 * The (member) routes are protected by middleware so only authenticated
 * users reach here, but the Navbar itself reads the session server-side
 * and renders the correct role-based links automatically.
 */
export default function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <Box component="div" sx={{ minHeight: "100vh" }}>
        {children}
      </Box>
      <Footer />
    </>
  );
}
