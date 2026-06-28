
import type { Metadata } from "next";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import ForbiddenActions from "./ForbiddenActions";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "403 – Access Denied",
  robots: { index: false, follow: false },
};

// ---------------------------------------------------------------------------
// ForbiddenPage — Server Component
// ---------------------------------------------------------------------------

/**
 * Rendered when a user attempts to access a page they lack permission for.
 *
 * The Edge Middleware redirects here (`/403`) when:
 * - An authenticated Member tries to reach an Admin or Super_Admin page.
 * - An authenticated Admin tries to reach a Super_Admin-only page.
 *
 * Requirements: 6.2, 6.3
 */
export default function ForbiddenPage() {
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
              bgcolor: "error.main",
              color: "#fff",
              mb: 3,
            }}
          >
            <LockOutlinedIcon sx={{ fontSize: 40 }} aria-hidden="true" />
          </Box>

          {/* Status code */}
          <Typography
            variant="h2"
            component="p"
            sx={{ fontWeight: 700, color: "error.main", lineHeight: 1 }}
          >
            403
          </Typography>

          {/* Title */}
          <Typography
            variant="h5"
            component="h1"
            gutterBottom
            sx={{ fontWeight: 600, mt: 1 }}
          >
            Access Denied
          </Typography>

          {/* Explanation */}
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ mb: 4, lineHeight: 1.7 }}
          >
            You don&apos;t have permission to view this page. If you believe
            this is a mistake, please contact an administrator.
          </Typography>

          {/* Actions */}
          <ForbiddenActions />
        </Paper>
      </Container>
    </Box>
  );
}
