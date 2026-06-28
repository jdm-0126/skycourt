import type { Metadata } from "next";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid2";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import EmailIcon from "@mui/icons-material/Email";
import FacebookIcon from "@mui/icons-material/Facebook";
import PhoneIcon from "@mui/icons-material/Phone";

import { createClient } from "@/lib/supabase/server";
import ContactForm from "@/components/contact/ContactForm";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Contact Us — Sky Court Pickleball",
  description:
    "Get in touch with Sky Court. Send us a message or reach us by phone, email, or Facebook.",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContactContent {
  phone?: string;
  email?: string;
  facebook_url?: string;
}

// ---------------------------------------------------------------------------
// Fallback defaults
// ---------------------------------------------------------------------------

const DEFAULT_CONTACT: ContactContent = {
  phone: "+63 (2) 8123-4567",
  email: "hello@skycourt.ph",
  facebook_url: "https://www.facebook.com/skycourt",
};

// ---------------------------------------------------------------------------
// Content fetching
// ---------------------------------------------------------------------------

async function fetchContactContent(): Promise<ContactContent> {
  try {
    const supabase = await createClient();
    const result = await supabase
      .from("website_content")
      .select("*")
      .eq("section", "contact")
      .maybeSingle();

    // Supabase types can narrow data to `never` in some versions — use explicit cast.
    const row = result.data as { content: unknown } | null;
    if (result.error || !row || row.content === null || row.content === undefined) {
      return DEFAULT_CONTACT;
    }
    return row.content as ContactContent;
  } catch {
    return DEFAULT_CONTACT;
  }
}

// ---------------------------------------------------------------------------
// Contact Us Page — Server Component
//
// Fetches phone, email, and Facebook link from website_content (Req 3.7)
// and displays them alongside the client ContactForm component (Req 3.6).
//
// Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
// ---------------------------------------------------------------------------

export default async function ContactPage() {
  // Req 3.7 — source contact info from website_content
  const contact = await fetchContactContent();

  const phone = contact.phone ?? DEFAULT_CONTACT.phone!;
  const email = contact.email ?? DEFAULT_CONTACT.email!;
  const facebookUrl = contact.facebook_url ?? DEFAULT_CONTACT.facebook_url!;

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
          py: { xs: 6, md: 8 },
          textAlign: "center",
          px: 2,
        }}
      >
        <Container maxWidth="md">
          <Typography
            variant="overline"
            component="p"
            sx={{
              color: "rgba(255,255,255,0.75)",
              fontWeight: 700,
              letterSpacing: 2,
              mb: 1,
            }}
          >
            Get In Touch
          </Typography>
          <Typography
            variant="h2"
            component="h1"
            sx={{
              fontWeight: 800,
              lineHeight: 1.1,
              fontSize: { xs: "2rem", sm: "2.8rem", md: "3.2rem" },
              textShadow: "0 2px 8px rgba(0,0,0,0.2)",
            }}
          >
            Contact Us
          </Typography>
        </Container>
      </Box>

      {/* ===================================================================
          Main Content — Contact Info + Form
      ==================================================================== */}
      <Box
        component="section"
        aria-label="Contact details and form"
        sx={{ bgcolor: "background.default", py: { xs: 6, md: 10 } }}
      >
        <Container maxWidth="lg">
          <Grid container spacing={4}>
            {/* ---------------------------------------------------------------
                Left column — Contact details (Req 3.6, 3.7)
            --------------------------------------------------------------- */}
            <Grid size={{ xs: 12, md: 5 }}>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <Box>
                  <Typography
                    variant="overline"
                    component="p"
                    sx={{ color: "primary.main", fontWeight: 700, letterSpacing: 2, mb: 1 }}
                  >
                    Reach Us
                  </Typography>
                  <Typography variant="h4" component="h2" fontWeight={700} sx={{ mb: 1 }}>
                    We&apos;d love to hear from you
                  </Typography>
                  <Divider
                    sx={{ width: 60, borderWidth: 3, borderColor: "primary.main", mb: 3 }}
                  />
                  <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                    Have a question, feedback, or just want to say hello? Fill in the form or
                    reach us directly using the details below.
                  </Typography>
                </Box>

                {/* Contact details card — Req 3.6 */}
                <Paper
                  elevation={0}
                  sx={{
                    p: 3,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 3,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2.5,
                  }}
                >
                  {/* Phone — Req 3.6 */}
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    <PhoneIcon
                      sx={{ color: "primary.main", flexShrink: 0 }}
                      aria-hidden="true"
                    />
                    <Box>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        fontWeight={600}
                        display="block"
                      >
                        Phone
                      </Typography>
                      <Link
                        href={`tel:${phone.replace(/\s/g, "")}`}
                        underline="hover"
                        color="text.primary"
                        variant="body1"
                        aria-label={`Call us at ${phone}`}
                      >
                        {phone}
                      </Link>
                    </Box>
                  </Box>

                  <Divider />

                  {/* Email — Req 3.6 */}
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    <EmailIcon
                      sx={{ color: "primary.main", flexShrink: 0 }}
                      aria-hidden="true"
                    />
                    <Box>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        fontWeight={600}
                        display="block"
                      >
                        Email
                      </Typography>
                      <Link
                        href={`mailto:${email}`}
                        underline="hover"
                        color="text.primary"
                        variant="body1"
                        aria-label={`Email us at ${email}`}
                      >
                        {email}
                      </Link>
                    </Box>
                  </Box>

                  <Divider />

                  {/* Facebook — Req 3.6 */}
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    <FacebookIcon
                      sx={{ color: "primary.main", flexShrink: 0 }}
                      aria-hidden="true"
                    />
                    <Box>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        fontWeight={600}
                        display="block"
                      >
                        Facebook
                      </Typography>
                      <Link
                        href={facebookUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        underline="hover"
                        color="text.primary"
                        variant="body1"
                        aria-label="Visit our Facebook page (opens in a new tab)"
                      >
                        Visit our Facebook page
                      </Link>
                    </Box>
                  </Box>
                </Paper>
              </Box>
            </Grid>

            {/* ---------------------------------------------------------------
                Right column — Contact form (Req 3.1–3.5)
            --------------------------------------------------------------- */}
            <Grid size={{ xs: 12, md: 7 }}>
              {/* ContactForm is a client component — handles form state,
                  validation, and submission (Req 3.1, 3.2, 3.3, 3.4, 3.5) */}
              <ContactForm />
            </Grid>
          </Grid>
        </Container>
      </Box>
    </Box>
  );
}
