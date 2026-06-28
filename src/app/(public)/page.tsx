import type { Metadata } from "next";
import NextLink from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardMedia from "@mui/material/CardMedia";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid2";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import SportsTennisIcon from "@mui/icons-material/SportsTennis";

import { createClient } from "@/lib/supabase/server";
import CtaButton from "@/components/home/CtaButton";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Sky Court — Pickleball Court Booking",
  description:
    "Discover Sky Court: state-of-the-art pickleball courts, competitive rates, and easy online booking. Register today.",
};

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

interface HeroContent {
  headline: string;
  subheading: string;
  cta_text: string;
}

interface AboutContent {
  text: string;
}

interface RateItem {
  label: string;
  price: string;
  note?: string;
}

interface FaqItem {
  question: string;
  answer: string;
}

interface FaqContent {
  items: FaqItem[];
}

interface GalleryImage {
  id: string;
  public_url: string;
  storage_path: string;
  display_order: number;
}

// ---------------------------------------------------------------------------
// Static fallbacks — shown when DB rows are missing / on fetch error
// ---------------------------------------------------------------------------

const DEFAULT_HERO: HeroContent = {
  headline: "Your Pickleball Home",
  subheading: "Sky Court offers world-class courts, competitive rates, and easy online booking. Join us on the court today.",
  cta_text: "Book a Court",
};

const DEFAULT_ABOUT: AboutContent = {
  text: "Sky Court is a premier pickleball facility designed for players of all skill levels. With professionally maintained courts, modern amenities, and a welcoming community, we are committed to making every game an exceptional experience.",
};

const DEFAULT_RATES: RateItem[] = [
  { label: "Recreational Play (per hour)", price: "₱200" },
  { label: "Competitive Play (per hour)", price: "₱250" },
  { label: "Court Rental (per hour)", price: "₱300", note: "Up to 4 players" },
  { label: "Monthly Membership", price: "₱1,500", note: "Unlimited recreational play" },
];

const DEFAULT_AMENITIES: string[] = [
  "6 Professional Courts",
  "LED Lighting for Night Play",
  "Equipment Rental",
  "Locker Rooms & Showers",
  "Pro Shop",
  "Cafeteria & Refreshments",
  "Free Parking",
  "Coaching & Clinics",
];

const DEFAULT_FAQ: FaqItem[] = [
  {
    question: "Do I need to bring my own equipment?",
    answer: "No — we offer paddle and ball rentals at the front desk. You are also welcome to bring your own equipment.",
  },
  {
    question: "How far in advance can I book?",
    answer: "You can book courts up to 7 days in advance through your member dashboard.",
  },
  {
    question: "Can I cancel my booking?",
    answer: "Yes. Cancellations made at least 2 hours before the booking time are free of charge.",
  },
];

// ---------------------------------------------------------------------------
// Content fetching helpers
// ---------------------------------------------------------------------------

async function fetchSection<T>(section: string, fallback: T): Promise<T> {
  try {
    const supabase = await createClient();
    const result = await supabase
      .from("website_content")
      .select("*")
      .eq("section", section)
      .maybeSingle();

    // Supabase types can narrow data to `never` in some versions — use explicit cast.
    const row = result.data as { content: unknown } | null;
    if (result.error || !row || row.content === null || row.content === undefined) {
      return fallback;
    }
    return row.content as T;
  } catch {
    return fallback;
  }
}

async function fetchGalleryPreview(): Promise<GalleryImage[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("gallery_images")
      .select("id, public_url, storage_path, display_order")
      .order("display_order", { ascending: true })
      .limit(6);

    if (error || !data) return [];
    return data as GalleryImage[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Home Page — Server Component
// ---------------------------------------------------------------------------

/**
 * Home page for Sky Court.
 *
 * All content is fetched from the `website_content` table so admins can edit
 * it without code changes (Req 1.9). Sensible defaults are shown when a
 * section row is missing.
 *
 * The CTA button is wrapped in a client-side ErrorBoundary (Req 1.8).
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9
 */
export default async function HomePage() {
  // Fetch all sections in parallel — Req 1.9
  const [hero, about, ratesContent, faqContent, galleryImages] = await Promise.all([
    fetchSection<HeroContent>("hero", DEFAULT_HERO),
    fetchSection<AboutContent>("about", DEFAULT_ABOUT),
    fetchSection<{ items: RateItem[] }>("rates", { items: DEFAULT_RATES }),
    fetchSection<FaqContent>("faq", { items: DEFAULT_FAQ }),
    fetchGalleryPreview(),
  ]);

  const rates: RateItem[] = ratesContent?.items?.length ? ratesContent.items : DEFAULT_RATES;
  const faqItems: FaqItem[] = faqContent?.items?.length ? faqContent.items : DEFAULT_FAQ;

  return (
    <Box component="main">
      {/* ===================================================================
          1. Hero Banner — Req 1.1, 1.7, 1.8
      ==================================================================== */}
      <Box
        component="section"
        aria-label="Hero banner"
        sx={{
          position: "relative",
          minHeight: { xs: 420, md: 560 },
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          background: "linear-gradient(135deg, #1b5e20 0%, #2e7d32 50%, #43a047 100%)",
          color: "#fff",
          px: 2,
          py: { xs: 8, md: 12 },
          overflow: "hidden",
        }}
      >
        {/* Decorative background icon */}
        <Box
          aria-hidden="true"
          sx={{
            position: "absolute",
            right: { xs: -60, md: -30 },
            top: { xs: -40, md: -20 },
            opacity: 0.07,
          }}
        >
          <SportsTennisIcon sx={{ fontSize: { xs: 280, md: 420 } }} />
        </Box>

        <Container maxWidth="md" sx={{ position: "relative", zIndex: 1 }}>
          {/* Headline — Req 1.1 */}
          <Typography
            variant="h2"
            component="h1"
            sx={{
              fontWeight: 800,
              lineHeight: 1.1,
              mb: 2,
              fontSize: { xs: "2.2rem", sm: "3rem", md: "3.8rem" },
              textShadow: "0 2px 8px rgba(0,0,0,0.2)",
            }}
          >
            {hero.headline}
          </Typography>

          {/* Subheading — Req 1.1 */}
          <Typography
            variant="h6"
            component="p"
            sx={{
              fontWeight: 400,
              maxWidth: 680,
              mx: "auto",
              lineHeight: 1.6,
              opacity: 0.92,
              fontSize: { xs: "1rem", md: "1.2rem" },
            }}
          >
            {hero.subheading}
          </Typography>

          {/* CTA Button with Error Boundary — Req 1.7, 1.8 */}
          <CtaButton label={hero.cta_text || DEFAULT_HERO.cta_text} />
        </Container>
      </Box>

      {/* ===================================================================
          2. About Section — Req 1.2
      ==================================================================== */}
      <Box
        component="section"
        aria-label="About Sky Court"
        sx={{ bgcolor: "background.paper", py: { xs: 8, md: 10 } }}
      >
        <Container maxWidth="md">
          <Typography
            variant="overline"
            component="p"
            sx={{ color: "primary.main", fontWeight: 700, letterSpacing: 2, mb: 1 }}
          >
            Who We Are
          </Typography>
          <Typography variant="h3" component="h2" sx={{ fontWeight: 700, mb: 3 }}>
            About Sky Court
          </Typography>
          <Divider
            sx={{
              width: 60,
              borderWidth: 3,
              borderColor: "primary.main",
              mb: 4,
            }}
          />
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ lineHeight: 1.85, fontSize: "1.1rem" }}
          >
            {about.text}
          </Typography>
        </Container>
      </Box>

      {/* ===================================================================
          3. Court Rates — Req 1.3
      ==================================================================== */}
      <Box
        component="section"
        aria-label="Court rates"
        sx={{ bgcolor: "background.default", py: { xs: 8, md: 10 } }}
      >
        <Container maxWidth="md">
          <Typography
            variant="overline"
            component="p"
            sx={{ color: "primary.main", fontWeight: 700, letterSpacing: 2, mb: 1 }}
          >
            Pricing
          </Typography>
          <Typography variant="h3" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
            Court Rates
          </Typography>
          <Divider sx={{ width: 60, borderWidth: 3, borderColor: "primary.main", mb: 5 }} />

          <Grid container spacing={3}>
            {rates.map((rate, idx) => (
              <Grid
                key={idx}
                size={{ xs: 12, sm: 6 }}
              >
                <Paper
                  elevation={0}
                  sx={{
                    p: 3,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 3,
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                    transition: "box-shadow 0.2s",
                    "&:hover": { boxShadow: 4 },
                  }}
                >
                  <Typography variant="subtitle1" fontWeight={600} color="text.primary">
                    {rate.label}
                  </Typography>
                  <Typography
                    variant="h4"
                    fontWeight={800}
                    color="primary.main"
                    sx={{ lineHeight: 1 }}
                  >
                    {rate.price}
                  </Typography>
                  {rate.note && (
                    <Typography variant="body2" color="text.secondary">
                      {rate.note}
                    </Typography>
                  )}
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* ===================================================================
          4. Amenities Section — Req 1.4
      ==================================================================== */}
      <Box
        component="section"
        aria-label="Amenities"
        sx={{
          bgcolor: "primary.dark",
          color: "#fff",
          py: { xs: 8, md: 10 },
        }}
      >
        <Container maxWidth="md">
          <Typography
            variant="overline"
            component="p"
            sx={{ color: "rgba(255,255,255,0.7)", fontWeight: 700, letterSpacing: 2, mb: 1 }}
          >
            Facilities
          </Typography>
          <Typography variant="h3" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
            Our Amenities
          </Typography>
          <Divider sx={{ width: 60, borderWidth: 3, borderColor: "rgba(255,255,255,0.5)", mb: 5 }} />

          <Grid container spacing={2}>
            {DEFAULT_AMENITIES.map((amenity, idx) => (
              <Grid
                key={idx}
                size={{ xs: 12, sm: 6, md: 4 }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  <CheckCircleOutlineIcon
                    sx={{ color: "rgba(255,255,255,0.85)", flexShrink: 0 }}
                    aria-hidden="true"
                  />
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>
                    {amenity}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* ===================================================================
          5. Gallery Preview — Req 1.5
      ==================================================================== */}
      {galleryImages.length > 0 && (
        <Box
          component="section"
          aria-label="Gallery preview"
          sx={{ bgcolor: "background.paper", py: { xs: 8, md: 10 } }}
        >
          <Container maxWidth="lg">
            <Typography
              variant="overline"
              component="p"
              sx={{ color: "primary.main", fontWeight: 700, letterSpacing: 2, mb: 1 }}
            >
              Gallery
            </Typography>
            <Typography variant="h3" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
              The Courts
            </Typography>
            <Divider sx={{ width: 60, borderWidth: 3, borderColor: "primary.main", mb: 5 }} />

            <Grid container spacing={2}>
              {galleryImages.map((img) => (
                <Grid
                  key={img.id}
                  size={{ xs: 12, sm: 6, md: 4 }}
                >
                  <Card
                    elevation={0}
                    sx={{
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: 2,
                      overflow: "hidden",
                      transition: "transform 0.2s, box-shadow 0.2s",
                      "&:hover": { transform: "scale(1.02)", boxShadow: 4 },
                    }}
                  >
                    <CardMedia
                      component="img"
                      height="220"
                      image={img.public_url}
                      alt="Sky Court pickleball court"
                      sx={{ objectFit: "cover" }}
                    />
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>
      )}

      {/* ===================================================================
          6. FAQ Section — Req 1.9 (content sourced from website_content)
      ==================================================================== */}
      {faqItems.length > 0 && (
        <Box
          component="section"
          aria-label="Frequently asked questions"
          sx={{ bgcolor: "background.default", py: { xs: 8, md: 10 } }}
        >
          <Container maxWidth="md">
            <Typography
              variant="overline"
              component="p"
              sx={{ color: "primary.main", fontWeight: 700, letterSpacing: 2, mb: 1 }}
            >
              FAQ
            </Typography>
            <Typography variant="h3" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
              Common Questions
            </Typography>
            <Divider sx={{ width: 60, borderWidth: 3, borderColor: "primary.main", mb: 5 }} />

            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {faqItems.map((item, idx) => (
                <Paper
                  key={idx}
                  elevation={0}
                  sx={{
                    p: 3,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 3,
                  }}
                >
                  <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                    {item.question}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                    {item.answer}
                  </Typography>
                </Paper>
              ))}
            </Box>
          </Container>
        </Box>
      )}

      {/* ===================================================================
          7. Bottom CTA Section — Req 1.6, 1.7, 1.8
      ==================================================================== */}
      <Box
        component="section"
        aria-label="Call to action"
        sx={{
          background: "linear-gradient(135deg, #1b5e20 0%, #2e7d32 100%)",
          color: "#fff",
          py: { xs: 8, md: 12 },
          textAlign: "center",
          px: 2,
        }}
      >
        <Container maxWidth="sm">
          <Typography
            variant="h3"
            component="h2"
            sx={{ fontWeight: 800, mb: 2, fontSize: { xs: "2rem", md: "2.8rem" } }}
          >
            Ready to Play?
          </Typography>
          <Typography
            variant="body1"
            sx={{ opacity: 0.88, mb: 4, fontSize: "1.1rem", lineHeight: 1.7 }}
          >
            Create a free account and reserve your court in minutes. See you on the court!
          </Typography>

          {/* CTA with Error Boundary — Req 1.7, 1.8 */}
          <CtaButton label="Get Started — It's Free" />
        </Container>
      </Box>
    </Box>
  );
}
