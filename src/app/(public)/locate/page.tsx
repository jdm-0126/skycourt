import type { Metadata } from "next";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid2";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import AccessTimeIcon from "@mui/icons-material/AccessTime";

import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Find Us — Sky Court Pickleball",
  description:
    "Find Sky Court's location, address, and business hours. We're conveniently located in Metro Manila.",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContactContent {
  phone?: string;
  email?: string;
  facebook_url?: string;
  address?: string;
  map_url?: string;
}

interface DayHours {
  open: string;
  close: string;
}

interface HoursContent {
  monday?: DayHours;
  tuesday?: DayHours;
  wednesday?: DayHours;
  thursday?: DayHours;
  friday?: DayHours;
  saturday?: DayHours;
  sunday?: DayHours;
}

// ---------------------------------------------------------------------------
// Fallback defaults — shown when DB rows are missing / on fetch error
// ---------------------------------------------------------------------------

const DEFAULT_ADDRESS = "123 Pickleball Drive, Metro Manila, Philippines";

// A generic Manila-area Google Maps embed (Rizal Park area as a placeholder)
const DEFAULT_MAP_URL =
  "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3861.802!2d120.9842!3d14.5995!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3397ca03571ec38b%3A0xa8a8a8a8a8a8a8a8!2sManila%2C%20Metro%20Manila%2C%20Philippines!5e0!3m2!1sen!2sph!4v1700000000000!5m2!1sen!2sph";

const DEFAULT_HOURS: HoursContent = {
  monday: { open: "8:00 AM", close: "10:00 PM" },
  tuesday: { open: "8:00 AM", close: "10:00 PM" },
  wednesday: { open: "8:00 AM", close: "10:00 PM" },
  thursday: { open: "8:00 AM", close: "10:00 PM" },
  friday: { open: "8:00 AM", close: "10:00 PM" },
  saturday: { open: "8:00 AM", close: "8:00 PM" },
  sunday: { open: "8:00 AM", close: "8:00 PM" },
};

// Ordered list of days for display
const DAYS_OF_WEEK = [
  { key: "monday" as keyof HoursContent, label: "Monday" },
  { key: "tuesday" as keyof HoursContent, label: "Tuesday" },
  { key: "wednesday" as keyof HoursContent, label: "Wednesday" },
  { key: "thursday" as keyof HoursContent, label: "Thursday" },
  { key: "friday" as keyof HoursContent, label: "Friday" },
  { key: "saturday" as keyof HoursContent, label: "Saturday" },
  { key: "sunday" as keyof HoursContent, label: "Sunday" },
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

// ---------------------------------------------------------------------------
// Locate Us Page — Server Component
//
// Requirements: 2.1 (embedded map), 2.2 (full address), 2.3 (operating hours),
//               2.4 (content sourced from website_content)
// ---------------------------------------------------------------------------

export default async function LocateUsPage() {
  // Fetch contact and hours sections in parallel — Req 2.4
  const [contact, hours] = await Promise.all([
    fetchSection<ContactContent>("contact", {}),
    fetchSection<HoursContent>("hours", DEFAULT_HOURS),
  ]);

  const address = contact.address ?? DEFAULT_ADDRESS;
  const mapUrl = contact.map_url ?? DEFAULT_MAP_URL;

  // Merge fetched hours with defaults so any missing day still shows a value
  const resolvedHours: HoursContent = { ...DEFAULT_HOURS, ...hours };

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
            Location
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
            Find Us
          </Typography>
        </Container>
      </Box>

      {/* ===================================================================
          Main Content — Map + Address + Hours
      ==================================================================== */}
      <Box
        component="section"
        aria-label="Location details"
        sx={{ bgcolor: "background.default", py: { xs: 6, md: 10 } }}
      >
        <Container maxWidth="lg">
          <Grid container spacing={4}>
            {/* ---------------------------------------------------------------
                Left column — Map (full width on mobile, 2/3 on desktop)
                Req 2.1: Embedded Google Map
            --------------------------------------------------------------- */}
            <Grid size={{ xs: 12, md: 8 }}>
              <Paper
                elevation={0}
                sx={{
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 3,
                  overflow: "hidden",
                  height: { xs: 300, sm: 400, md: 480 },
                }}
              >
                <Box
                  component="iframe"
                  src={mapUrl}
                  title="Sky Court location map"
                  aria-label="Embedded Google Map showing Sky Court location"
                  width="100%"
                  height="100%"
                  sx={{
                    display: "block",
                    border: 0,
                  }}
                  // Security: allow only map-related permissions
                  {...({ allowFullScreen: true, loading: "lazy", referrerPolicy: "no-referrer-when-downgrade" } as Record<string, unknown>)}
                />
              </Paper>
            </Grid>

            {/* ---------------------------------------------------------------
                Right column — Address & Hours
            --------------------------------------------------------------- */}
            <Grid size={{ xs: 12, md: 4 }}>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {/* Address — Req 2.2 */}
                <Paper
                  elevation={0}
                  sx={{
                    p: 3,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 3,
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                    <LocationOnIcon
                      sx={{ color: "primary.main", fontSize: "1.5rem" }}
                      aria-hidden="true"
                    />
                    <Typography variant="h6" component="h2" fontWeight={700}>
                      Our Address
                    </Typography>
                  </Box>
                  <Divider sx={{ mb: 2 }} />
                  <Typography
                    variant="body1"
                    color="text.secondary"
                    sx={{ lineHeight: 1.7 }}
                  >
                    {address}
                  </Typography>
                </Paper>

                {/* Operating Hours — Req 2.3 */}
                <Paper
                  elevation={0}
                  sx={{
                    p: 3,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 3,
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                    <AccessTimeIcon
                      sx={{ color: "primary.main", fontSize: "1.5rem" }}
                      aria-hidden="true"
                    />
                    <Typography variant="h6" component="h2" fontWeight={700}>
                      Operating Hours
                    </Typography>
                  </Box>
                  <Divider sx={{ mb: 2 }} />
                  <Box
                    component="dl"
                    sx={{ m: 0, display: "flex", flexDirection: "column", gap: 1 }}
                  >
                    {DAYS_OF_WEEK.map(({ key, label }) => {
                      const dayHours = resolvedHours[key];
                      return (
                        <Box
                          key={key}
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            py: 0.5,
                            borderBottom: "1px solid",
                            borderColor: "divider",
                            "&:last-child": { borderBottom: 0 },
                          }}
                        >
                          <Typography
                            component="dt"
                            variant="body2"
                            fontWeight={600}
                            color="text.primary"
                          >
                            {label}
                          </Typography>
                          <Typography
                            component="dd"
                            variant="body2"
                            color="text.secondary"
                            sx={{ m: 0 }}
                          >
                            {dayHours
                              ? `${dayHours.open} – ${dayHours.close}`
                              : "Closed"}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Box>
                </Paper>
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>
    </Box>
  );
}
