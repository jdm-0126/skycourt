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
import CheckIcon from "@mui/icons-material/Check";
import SportsTennisIcon from "@mui/icons-material/SportsTennis";

import { createClient } from "@/lib/supabase/server";
import CtaButton from "@/components/home/CtaButton";
import {
  DEFAULT_HOMEPAGE_ORDER,
  type HomepageSection,
} from "@/lib/validation/settings";

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
  visible?: boolean;
  promo?: string;
}

interface RateItem {
  tier: string;          // e.g. "Walk-in"
  price: string;         // e.g. "₱200"
  per: string;           // e.g. "/hr" or "/court/hr"
  subtitle: string;      // e.g. "Recreational Play"
  description: string;
  features: string[];    // checklist items
  cta: string;           // button label
  ctaHref: string;       // button destination
  highlighted?: boolean; // border highlight
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
  visible: true,
  promo: "",
};

const DEFAULT_RATES: RateItem[] = [
  {
    tier: "Walk-in",
    price: "₱200",
    per: "/hr",
    subtitle: "Recreational Play",
    description: "Drop in anytime during open hours. Perfect for casual games with friends or solo practice.",
    features: [
      "Open court access",
      "Equipment rental available",
      "No reservation required",
      "LED-lit courts for night play",
    ],
    cta: "Book a Court",
    ctaHref: "/member/bookings/new",
    highlighted: false,
  },
  {
    tier: "Competitive",
    price: "₱250",
    per: "/hr",
    subtitle: "Competitive Play",
    description: "Dedicated court time for serious players. Priority booking and extended sessions available.",
    features: [
      "Everything in Walk-in",
      "Priority court selection",
      "Scoreboard access",
      "Coaching & clinics eligible",
    ],
    cta: "Book Competitive",
    ctaHref: "/member/bookings/new",
    highlighted: false,
  },
  {
    tier: "Court Rental",
    price: "₱300",
    per: "/hr",
    subtitle: "Private Court Rental",
    description: "Reserve an entire court exclusively for your group. Up to 4 players per court.",
    features: [
      "Exclusive court access",
      "Up to 4 players",
      "Locker rooms included",
      "Pro shop discounts",
    ],
    cta: "Rent a Court",
    ctaHref: "/member/bookings/new",
    highlighted: false,
  },
  {
    tier: "Club / Group",
    price: "₱400",
    per: "/court/hr",
    subtitle: "Club Reservation",
    description: "Block-book multiple courts for your club. Minimum 4 hours. Courts reducible up to the day before.",
    features: [
      "Reserve multiple courts",
      "Minimum 4 hours",
      "Flexible court count — reduce up to day before",
      "Cancellable up to the day before",
      "Ideal for tournaments & club sessions",
    ],
    cta: "Reserve as Club",
    ctaHref: "/member/bookings/club/new",
    highlighted: true,
  },
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

async function fetchHomepageOrder(): Promise<HomepageSection[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "homepage_order")
      .maybeSingle<{ value: string }>();

    if (data?.value) {
      const parsed = JSON.parse(data.value) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as HomepageSection[];
      }
    }
    return DEFAULT_HOMEPAGE_ORDER;
  } catch {
    return DEFAULT_HOMEPAGE_ORDER;
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
  const [hero, about, ratesContent, faqContent, galleryImages, homepageOrder] = await Promise.all([
    fetchSection<HeroContent>("hero", DEFAULT_HERO),
    fetchSection<AboutContent>("about", DEFAULT_ABOUT),
    fetchSection<{ items: RateItem[] }>("rates", { items: DEFAULT_RATES }),
    fetchSection<FaqContent>("faq", { items: DEFAULT_FAQ }),
    fetchGalleryPreview(),
    fetchHomepageOrder(),
  ]);

  const rates: RateItem[] = ratesContent?.items?.length ? ratesContent.items : DEFAULT_RATES;
  const faqItems: FaqItem[] = faqContent?.items?.length ? faqContent.items : DEFAULT_FAQ;

  // ---------------------------------------------------------------------------
  // Section renderers — called in the order defined by homepageOrder
  // ---------------------------------------------------------------------------

  function renderAbout() {
    if (about.visible === false) return null;
    return (
      <Box
        key="about"
        component="section"
        aria-label="About Sky Court"
        sx={{ bgcolor: "background.paper", py: { xs: 8, md: 10 } }}
      >
        <Container maxWidth="md">
          <Typography variant="overline" component="p" sx={{ color: "primary.main", fontWeight: 700, letterSpacing: 2, mb: 1 }}>
            {about.promo ? "Promotions" : "Who We Are"}
          </Typography>
          <Typography variant="h3" component="h2" sx={{ fontWeight: 700, mb: 3 }}>
            {about.promo ? "Special Offer" : "About Sky Court"}
          </Typography>
          <Divider sx={{ width: 60, borderWidth: 3, borderColor: "primary.main", mb: 4 }} />
          <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.85, fontSize: "1.1rem" }}>
            {about.promo || about.text}
          </Typography>
        </Container>
      </Box>
    );
  }

  function renderRates() {
    return (
      <Box
        key="rates"
        component="section"
        aria-label="Court rates"
        sx={{ bgcolor: "#f0f4f0", py: { xs: 8, md: 10 } }}
      >
        <Container maxWidth="lg">
          {/* Section header */}
          <Box sx={{ textAlign: "center", mb: 6 }}>
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
            <Divider sx={{ width: 60, borderWidth: 3, borderColor: "primary.main", mx: "auto", mb: 2 }} />
            <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 520, mx: "auto" }}>
              Choose the plan that fits your game. All courts are professionally maintained with LED lighting for night play.
            </Typography>
          </Box>

          {/* Pricing card grid — driven entirely by DB data */}
          <Grid container spacing={3} sx={{ alignItems: "stretch" }}>
            {rates.map((card, idx) => (
              <Grid key={idx} size={{ xs: 12, sm: 6, lg: 3 }}>
                <Paper
                  elevation={0}
                  sx={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    borderRadius: 4,
                    border: card.highlighted ? "2px solid" : "1px solid",
                    borderColor: card.highlighted ? "primary.main" : "rgba(0,0,0,0.08)",
                    bgcolor: "#fff",
                    overflow: "hidden",
                    transition: "box-shadow 0.25s, transform 0.25s",
                    "&:hover": {
                      boxShadow: "0 8px 32px rgba(27,94,32,0.13)",
                      transform: "translateY(-2px)",
                    },
                  }}
                >
                  {/* Card body */}
                  <Box sx={{ p: 3.5, flex: 1, display: "flex", flexDirection: "column" }}>
                    {/* Tier label */}
                    <Typography
                      variant="overline"
                      sx={{
                        color: "primary.main",
                        fontWeight: 800,
                        letterSpacing: 2,
                        fontSize: "0.72rem",
                        mb: 1.5,
                        display: "block",
                      }}
                    >
                      {card.tier}
                    </Typography>

                    {/* Price */}
                    <Box sx={{ display: "flex", alignItems: "flex-end", gap: 0.5, mb: 0.5 }}>
                      <Typography
                        variant="h2"
                        component="span"
                        sx={{
                          fontWeight: 800,
                          lineHeight: 1,
                          color: "text.primary",
                          fontSize: { xs: "2.8rem", md: "3.2rem" },
                        }}
                      >
                        {card.price}
                      </Typography>
                      <Typography
                        variant="body1"
                        component="span"
                        color="text.secondary"
                        sx={{ mb: 0.5 }}
                      >
                        {card.per}
                      </Typography>
                    </Box>

                    {/* Bold subtitle */}
                    <Typography
                      variant="overline"
                      sx={{
                        fontWeight: 800,
                        letterSpacing: 1.5,
                        color: "text.primary",
                        fontSize: "0.68rem",
                        mb: 1.5,
                        display: "block",
                      }}
                    >
                      {card.subtitle}
                    </Typography>

                    {/* Description */}
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ lineHeight: 1.7, mb: 3 }}
                    >
                      {card.description}
                    </Typography>

                    {/* Features checklist */}
                    <Box
                      component="ul"
                      sx={{
                        listStyle: "none",
                        p: 0,
                        m: 0,
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        gap: 1.25,
                      }}
                    >
                      {(card.features ?? []).map((feature, fi) => (
                        <Box
                          key={fi}
                          component="li"
                          sx={{ display: "flex", alignItems: "flex-start", gap: 1.25 }}
                        >
                          <CheckIcon
                            sx={{ color: "primary.main", fontSize: 18, mt: "1px", flexShrink: 0 }}
                            aria-hidden="true"
                          />
                          <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
                            {feature}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>

                  {/* Full-width CTA button */}
                  <Box sx={{ px: 3.5, pb: 3.5 }}>
                    <NextLink href={card.ctaHref ?? "/member/bookings/new"} style={{ textDecoration: "none", display: "block" }}>
                      <Button
                        variant="contained"
                        fullWidth
                        size="large"
                        sx={{
                          bgcolor: "#1a2e1a",
                          color: "#fff",
                          fontWeight: 700,
                          fontSize: "0.95rem",
                          py: 1.5,
                          borderRadius: 2.5,
                          "&:hover": { bgcolor: "#2e7d32" },
                        }}
                      >
                        {card.cta}
                      </Button>
                    </NextLink>
                  </Box>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>
    );
  }

  function renderGallery() {
    if (galleryImages.length === 0) return null;
    return (
      <Box
        key="gallery"
        component="section"
        aria-label="Gallery preview"
        sx={{ bgcolor: "background.paper", py: { xs: 8, md: 10 } }}
      >
        <Container maxWidth="lg">
          <Typography variant="overline" component="p" sx={{ color: "primary.main", fontWeight: 700, letterSpacing: 2, mb: 1 }}>Gallery</Typography>
          <Typography variant="h3" component="h2" sx={{ fontWeight: 700, mb: 1 }}>The Courts</Typography>
          <Divider sx={{ width: 60, borderWidth: 3, borderColor: "primary.main", mb: 5 }} />
          <Grid container spacing={2}>
            {galleryImages.map((img) => (
              <Grid key={img.id} size={{ xs: 12, sm: 6, md: 4 }}>
                <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflow: "hidden", transition: "transform 0.2s, box-shadow 0.2s", "&:hover": { transform: "scale(1.02)", boxShadow: 4 } }}>
                  <CardMedia component="img" height="220" image={img.public_url} alt="Sky Court pickleball court" sx={{ objectFit: "cover" }} />
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>
    );
  }

  function renderAmenities() {
    return (
      <Box
        key="amenities"
        component="section"
        aria-label="Amenities"
        sx={{ bgcolor: "primary.dark", color: "#fff", py: { xs: 8, md: 10 } }}
      >
        <Container maxWidth="md">
          <Typography variant="overline" component="p" sx={{ color: "rgba(255,255,255,0.7)", fontWeight: 700, letterSpacing: 2, mb: 1 }}>Facilities</Typography>
          <Typography variant="h3" component="h2" sx={{ fontWeight: 700, mb: 1 }}>Our Amenities</Typography>
          <Divider sx={{ width: 60, borderWidth: 3, borderColor: "rgba(255,255,255,0.5)", mb: 5 }} />
          <Grid container spacing={2}>
            {DEFAULT_AMENITIES.map((amenity, idx) => (
              <Grid key={idx} size={{ xs: 12, sm: 6, md: 4 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  <CheckCircleOutlineIcon sx={{ color: "rgba(255,255,255,0.85)", flexShrink: 0 }} aria-hidden="true" />
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>{amenity}</Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>
    );
  }

  function renderFaq() {
    if (faqItems.length === 0) return null;
    return (
      <Box
        key="faq"
        component="section"
        aria-label="Frequently asked questions"
        sx={{ bgcolor: "background.default", py: { xs: 8, md: 10 } }}
      >
        <Container maxWidth="md">
          <Typography variant="overline" component="p" sx={{ color: "primary.main", fontWeight: 700, letterSpacing: 2, mb: 1 }}>FAQ</Typography>
          <Typography variant="h3" component="h2" sx={{ fontWeight: 700, mb: 1 }}>Common Questions</Typography>
          <Divider sx={{ width: 60, borderWidth: 3, borderColor: "primary.main", mb: 5 }} />
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {faqItems.map((item, idx) => (
              <Paper key={idx} elevation={0} sx={{ p: 3, border: "1px solid", borderColor: "divider", borderRadius: 3 }}>
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>{item.question}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>{item.answer}</Typography>
              </Paper>
            ))}
          </Box>
        </Container>
      </Box>
    );
  }

  const sectionRenderers: Record<HomepageSection, () => React.ReactNode> = {
    about: renderAbout,
    rates: renderRates,
    gallery: renderGallery,
    amenities: renderAmenities,
    faq: renderFaq,
  };

  return (
    <Box component="main">
      {/* ===================================================================
          Hero Banner — always first, Req 1.1, 1.7, 1.8
      ==================================================================== */}
      <Box
        component="section"
        aria-label="Hero banner"
        sx={{
          position: "relative",
          minHeight: { xs: 480, md: 600 },
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          background: "linear-gradient(135deg, #1b5e20 0%, #2e7d32 50%, #43a047 100%)",
          color: "#fff",
          px: 2,
          pt: { xs: 16, md: 20 },
          pb: { xs: 8, md: 12 },
          overflow: "hidden",
          mt: "-64px",
        }}
      >
        <Box aria-hidden="true" sx={{ position: "absolute", right: { xs: -60, md: -30 }, top: { xs: -40, md: -20 }, opacity: 0.07 }}>
          <SportsTennisIcon sx={{ fontSize: { xs: 280, md: 420 } }} />
        </Box>
        <Container maxWidth="md" sx={{ position: "relative", zIndex: 1 }}>
          <Typography variant="h2" component="h1" sx={{ fontWeight: 800, lineHeight: 1.1, mb: 2, fontSize: { xs: "2.2rem", sm: "3rem", md: "3.8rem" }, textShadow: "0 2px 8px rgba(0,0,0,0.2)" }}>
            {hero.headline}
          </Typography>
          <Typography variant="h6" component="p" sx={{ fontWeight: 400, maxWidth: 680, mx: "auto", lineHeight: 1.6, opacity: 0.92, fontSize: { xs: "1rem", md: "1.2rem" } }}>
            {hero.subheading}
          </Typography>
          <CtaButton label={hero.cta_text || DEFAULT_HERO.cta_text} />
        </Container>
      </Box>

      {/* ===================================================================
          Ordered sections — rendered in the admin-configured order
      ==================================================================== */}
      {homepageOrder.map((sectionKey) => {
        const renderer = sectionRenderers[sectionKey];
        return renderer ? renderer() : null;
      })}

      {/* ===================================================================
          Bottom CTA — always last, Req 1.6, 1.7, 1.8
      ==================================================================== */}
      <Box
        component="section"
        aria-label="Call to action"
        sx={{ background: "linear-gradient(135deg, #1b5e20 0%, #2e7d32 100%)", color: "#fff", py: { xs: 8, md: 12 }, textAlign: "center", px: 2 }}
      >
        <Container maxWidth="sm">
          <Typography variant="h3" component="h2" sx={{ fontWeight: 800, mb: 2, fontSize: { xs: "2rem", md: "2.8rem" } }}>
            Ready to Play?
          </Typography>
          <Typography variant="body1" sx={{ opacity: 0.88, mb: 4, fontSize: "1.1rem", lineHeight: 1.7 }}>
            Create a free account and reserve your court in minutes. See you on the court!
          </Typography>
          <CtaButton label="Get Started — It's Free" />
        </Container>
      </Box>
    </Box>
  );
}
