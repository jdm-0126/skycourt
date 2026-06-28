import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";

// ---------------------------------------------------------------------------
// Footer — Server Component
// ---------------------------------------------------------------------------

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "About", href: "/#about" },
  { label: "Contact", href: "/contact" },
  { label: "Locate Us", href: "/locate" },
] as const;

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Site-wide footer.
 *
 * Displays Sky Court branding, navigation links, and a copyright notice.
 * Rendered as a React Server Component — no client-side JavaScript required.
 *
 * Requirements: 22.2 (shown on maintenance page), 23 (consistent layout)
 */
export default function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        bgcolor: "primary.dark",
        color: "primary.contrastText",
        py: 4,
        mt: "auto",
      }}
    >
      <Container maxWidth="lg">
        {/* Branding + links row */}
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", sm: "center" }}
          spacing={3}
        >
          {/* Brand */}
          <Box>
            <Typography
              variant="h6"
              component="span"
              sx={{ fontWeight: 700, color: "inherit" }}
            >
              Sky Court
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: "rgba(255,255,255,0.7)", mt: 0.5 }}
            >
              Pickleball Court Booking
            </Typography>
          </Box>

          {/* Navigation links */}
          <Stack
            component="nav"
            direction="row"
            spacing={3}
            flexWrap="wrap"
            aria-label="Footer navigation"
          >
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                component={NextLink}
                href={link.href}
                color="inherit"
                underline="hover"
                variant="body2"
                sx={{ color: "rgba(255,255,255,0.85)" }}
              >
                {link.label}
              </Link>
            ))}
          </Stack>
        </Stack>

        <Divider sx={{ borderColor: "rgba(255,255,255,0.2)", my: 3 }} />

        {/* Copyright */}
        <Typography
          variant="body2"
          align="center"
          sx={{ color: "rgba(255,255,255,0.6)" }}
        >
          &copy; {CURRENT_YEAR} Sky Court. All rights reserved.
        </Typography>
      </Container>
    </Box>
  );
}
