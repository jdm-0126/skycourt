import type { Metadata } from "next";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";

import BookingFlow from "@/components/booking/BookingFlow";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Book a Court — Sky Court Pickleball",
  description:
    "Reserve a pickleball court at Sky Court. Select a date, choose a court, pick a time slot, and confirm your booking.",
};

// ---------------------------------------------------------------------------
// New Booking Page — Server Component
//
// Renders the BookingFlow client component which handles the full multi-step
// booking wizard: DatePicker → CourtSelector → SlotPicker → ConfirmStep.
//
// On successful booking creation, BookingFlow redirects to the booking detail
// page at /member/bookings/:id (Requirement 7.6).
//
// The (member) route group is protected by middleware — only authenticated
// members, admins, and super_admins reach this page (Requirement 6.1).
//
// Requirements: 7.1, 7.6
// ---------------------------------------------------------------------------

export default function NewBookingPage() {
  return (
    <Box component="main">
      {/* ===================================================================
          Page Header — green gradient consistent with other member pages
      ==================================================================== */}
      <Box
        component="section"
        aria-label="Page header"
        sx={{
          background:
            "linear-gradient(135deg, #1b5e20 0%, #2e7d32 50%, #43a047 100%)",
          color: "#fff",
          py: { xs: 5, md: 7 },
          px: 2,
        }}
      >
        <Container maxWidth="lg">
          <Typography
            variant="overline"
            component="p"
            sx={{
              color: "rgba(255,255,255,0.75)",
              fontWeight: 700,
              letterSpacing: 2,
              mb: 0.5,
            }}
          >
            Member Portal
          </Typography>
          <Typography
            variant="h3"
            component="h1"
            sx={{
              fontWeight: 800,
              fontSize: { xs: "1.8rem", sm: "2.4rem", md: "2.8rem" },
              textShadow: "0 2px 8px rgba(0,0,0,0.2)",
            }}
          >
            Book a Court
          </Typography>
          <Typography
            variant="body1"
            sx={{ color: "rgba(255,255,255,0.85)", mt: 1 }}
          >
            Follow the steps below to reserve your pickleball court session.
          </Typography>
        </Container>
      </Box>

      {/* ===================================================================
          Booking Flow
      ==================================================================== */}
      <Box
        component="section"
        aria-label="Booking steps"
        sx={{ bgcolor: "background.default", py: { xs: 4, md: 6 } }}
      >
        <Container maxWidth="md">
          {/* BookingFlow is a client component that manages the full wizard
              state: date selection, court selection, slot selection, and
              final confirmation. On success it redirects to the booking
              detail page (Requirement 7.6). */}
          <BookingFlow />
        </Container>
      </Box>
    </Box>
  );
}
