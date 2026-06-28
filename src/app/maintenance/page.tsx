import type { Metadata } from "next";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import BuildIcon from "@mui/icons-material/Build";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Under Maintenance",
  robots: { index: false, follow: false },
};

// ---------------------------------------------------------------------------
// MaintenancePage — Server Component
// ---------------------------------------------------------------------------

/**
 * Displayed when maintenance mode is active (`maintenance_mode = true` in
 * `system_settings`). The Edge Middleware intercepts all public-route requests
 * and redirects guests and members here; admins and super_admins are exempt.
 *
 * The page is intentionally static — no Supabase calls — so it renders even
 * when the database is unavailable.
 *
 * Requirements: 22.2
 */
export default function MaintenancePage() {
  return (
    <Box
      component="main"
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
        px: 2,
        py: 6,
      }}
    >
      <Container maxWidth="sm">
        <Paper
          elevation={0}
          sx={{
            p: { xs: 4, sm: 6 },
            borderRadius: 3,
            textAlign: "center",
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          {/* Icon */}
          <Box
            sx={{
              display: "inline-flex",
              p: 2,
              borderRadius: "50%",
              bgcolor: "primary.main",
              color: "primary.contrastText",
              mb: 3,
            }}
          >
            <BuildIcon sx={{ fontSize: 40 }} aria-hidden="true" />
          </Box>

          {/* Brand */}
          <Typography
            variant="h4"
            component="h1"
            gutterBottom
            sx={{ fontWeight: 700, color: "primary.main" }}
          >
            Sky Court
          </Typography>

          {/* Main message */}
          <Typography variant="h5" component="p" gutterBottom sx={{ fontWeight: 600 }}>
            Under Maintenance
          </Typography>

          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ mb: 4, lineHeight: 1.7 }}
          >
            Sky Court is currently undergoing maintenance. Please check back
            soon. We apologise for any inconvenience.
          </Typography>

          {/* Contact info */}
          <Stack spacing={1.5} alignItems="center">
            <Typography variant="subtitle2" color="text.secondary">
              Need to reach us in the meantime?
            </Typography>

            <Stack direction="row" spacing={1} alignItems="center">
              <PhoneOutlinedIcon
                fontSize="small"
                color="primary"
                aria-hidden="true"
              />
              <Typography variant="body2">+63 912 345 6789</Typography>
            </Stack>

            <Stack direction="row" spacing={1} alignItems="center">
              <EmailOutlinedIcon
                fontSize="small"
                color="primary"
                aria-hidden="true"
              />
              <Typography variant="body2">info@skycourt.ph</Typography>
            </Stack>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}
