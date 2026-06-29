import type { Metadata } from "next";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import GroupsIcon from "@mui/icons-material/Groups";

import ClubBookingFlow from "@/components/booking/ClubBookingFlow";

export const metadata: Metadata = {
  title: "Club Court Reservation — Sky Court Pickleball",
  description:
    "Reserve multiple courts as a club at Sky Court. Minimum 4 hours at ₱400 per court per hour.",
};

/**
 * Club Court Reservation page.
 *
 * Renders the ClubBookingFlow wizard which allows a member to reserve
 * multiple courts for a minimum of 4 hours at the club rate of ₱400/court/hr.
 *
 * Reservations can only be cancelled (not rescheduled). Courts may be
 * reduced up to the day before the event.
 */
export default function ClubBookingPage() {
  return (
    <Box component="main">
      {/* ===================================================================
          Page Header
      ==================================================================== */}
      <Box
        component="section"
        aria-label="Page header"
        sx={{
          background: "linear-gradient(135deg, #1b5e20 0%, #2e7d32 50%, #43a047 100%)",
          color: "#fff",
          py: { xs: 5, md: 7 },
          px: 2,
        }}
      >
        <Container maxWidth="lg">
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
            <GroupsIcon sx={{ fontSize: 32, opacity: 0.9 }} aria-hidden="true" />
            <Typography
              variant="overline"
              component="p"
              sx={{ color: "rgba(255,255,255,0.75)", fontWeight: 700, letterSpacing: 2 }}
            >
              Club Reservation
            </Typography>
          </Box>
          <Typography
            variant="h3"
            component="h1"
            sx={{
              fontWeight: 800,
              fontSize: { xs: "1.8rem", sm: "2.4rem", md: "2.8rem" },
              textShadow: "0 2px 8px rgba(0,0,0,0.2)",
            }}
          >
            Reserve Courts as a Club
          </Typography>
          <Typography variant="body1" sx={{ color: "rgba(255,255,255,0.85)", mt: 1 }}>
            ₱400 per court per hour · Minimum 4 hours · Cancellable up to the day before
          </Typography>
        </Container>
      </Box>

      {/* ===================================================================
          Booking Flow
      ==================================================================== */}
      <Box
        component="section"
        aria-label="Club reservation steps"
        sx={{ bgcolor: "background.default", py: { xs: 4, md: 6 } }}
      >
        <Container maxWidth="md">
          <ClubBookingFlow />
        </Container>
      </Box>
    </Box>
  );
}
