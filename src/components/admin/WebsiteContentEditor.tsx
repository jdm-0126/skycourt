"use client";

/**
 * WebsiteContentEditor — Client Component
 *
 * A per-section editor for the website_content table. Accepts a `section`
 * prop and renders the appropriate form fields. On mount it fetches current
 * content from GET /api/content/:section; on save it PATCHes the same route.
 * A live preview panel is shown beneath the form.
 *
 * Supported sections:
 *   hero    — headline, subheading, cta_text
 *   about   — text
 *   contact — phone, email, facebook_url
 *   hours   — monday…sunday: { open, close }
 *   rates   — items: [{ label, price, note? }]
 *   faq     — items: [{ question, answer }]
 *
 * Requirements: 13.1, 13.2, 13.3
 */

import React, { useState, useEffect, useCallback } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import VisibilityIcon from "@mui/icons-material/Visibility";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContentSection = "hero" | "about" | "contact" | "hours" | "rates" | "faq";

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
type Day = (typeof DAYS)[number];

interface HeroContent {
  headline: string;
  subheading: string;
  cta_text: string;
}

interface AboutContent {
  text: string;
}

interface ContactContent {
  phone: string;
  email: string;
  facebook_url: string;
}

interface HoursContent {
  monday: { open: string; close: string };
  tuesday: { open: string; close: string };
  wednesday: { open: string; close: string };
  thursday: { open: string; close: string };
  friday: { open: string; close: string };
  saturday: { open: string; close: string };
  sunday: { open: string; close: string };
}

interface RateItem {
  label: string;
  price: string;
  note?: string;
}
interface RatesContent {
  items: RateItem[];
}

interface FaqItem {
  question: string;
  answer: string;
}
interface FaqContent {
  items: FaqItem[];
}

type SectionContent =
  | HeroContent
  | AboutContent
  | ContactContent
  | HoursContent
  | RatesContent
  | FaqContent;

export interface WebsiteContentEditorProps {
  section: ContentSection;
}

// ---------------------------------------------------------------------------
// Default / empty content per section
// ---------------------------------------------------------------------------

function defaultContent(section: ContentSection): SectionContent {
  switch (section) {
    case "hero":
      return { headline: "", subheading: "", cta_text: "" };
    case "about":
      return { text: "" };
    case "contact":
      return { phone: "", email: "", facebook_url: "" };
    case "hours": {
      const slot = { open: "08:00", close: "22:00" };
      return {
        monday: { ...slot },
        tuesday: { ...slot },
        wednesday: { ...slot },
        thursday: { ...slot },
        friday: { ...slot },
        saturday: { ...slot },
        sunday: { ...slot },
      };
    }
    case "rates":
      return { items: [{ label: "", price: "", note: "" }] };
    case "faq":
      return { items: [{ question: "", answer: "" }] };
  }
}

function sectionLabel(section: ContentSection): string {
  switch (section) {
    case "hero":    return "Hero Banner";
    case "about":   return "About Section";
    case "contact": return "Contact Details";
    case "hours":   return "Operating Hours";
    case "rates":   return "Court Rates";
    case "faq":     return "FAQ";
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Section-specific form editors
// ---------------------------------------------------------------------------

interface FormProps<T> {
  data: T;
  onChange: (data: T) => void;
}

function HeroEditor({ data, onChange }: FormProps<HeroContent>) {
  return (
    <Stack spacing={2}>
      <TextField
        label="Headline"
        fullWidth
        value={data.headline}
        onChange={(e) => onChange({ ...data, headline: e.target.value })}
        required
        inputProps={{ "aria-label": "Hero headline" }}
      />
      <TextField
        label="Subheading"
        fullWidth
        multiline
        rows={2}
        value={data.subheading}
        onChange={(e) => onChange({ ...data, subheading: e.target.value })}
        inputProps={{ "aria-label": "Hero subheading" }}
      />
      <TextField
        label="CTA Button Text"
        fullWidth
        value={data.cta_text}
        onChange={(e) => onChange({ ...data, cta_text: e.target.value })}
        inputProps={{ "aria-label": "CTA button text" }}
      />
    </Stack>
  );
}

function AboutEditor({ data, onChange }: FormProps<AboutContent>) {
  return (
    <TextField
      label="About Text"
      fullWidth
      multiline
      rows={6}
      value={data.text}
      onChange={(e) => onChange({ text: e.target.value })}
      inputProps={{ "aria-label": "About section text" }}
    />
  );
}

function ContactEditor({ data, onChange }: FormProps<ContactContent>) {
  return (
    <Stack spacing={2}>
      <TextField
        label="Phone Number"
        fullWidth
        value={data.phone}
        onChange={(e) => onChange({ ...data, phone: e.target.value })}
        inputProps={{ "aria-label": "Phone number" }}
      />
      <TextField
        label="Email Address"
        fullWidth
        type="email"
        value={data.email}
        onChange={(e) => onChange({ ...data, email: e.target.value })}
        inputProps={{ "aria-label": "Contact email" }}
      />
      <TextField
        label="Facebook Page URL"
        fullWidth
        value={data.facebook_url}
        onChange={(e) => onChange({ ...data, facebook_url: e.target.value })}
        inputProps={{ "aria-label": "Facebook URL" }}
      />
    </Stack>
  );
}

function HoursEditor({ data, onChange }: FormProps<HoursContent>) {
  function updateDay(day: Day, field: "open" | "close", value: string) {
    onChange({ ...data, [day]: { ...data[day], [field]: value } });
  }

  return (
    <Stack spacing={2}>
      {DAYS.map((day) => (
        <Box key={day}>
          <Typography
            variant="caption"
            color="text.secondary"
            fontWeight={600}
            sx={{ mb: 0.5, display: "block" }}
          >
            {capitalize(day)}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              label="Open"
              type="time"
              size="small"
              value={data[day]?.open ?? ""}
              onChange={(e) => updateDay(day, "open", e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              inputProps={{ "aria-label": `${capitalize(day)} open time` }}
              sx={{ width: 130 }}
            />
            <Typography variant="body2" color="text.secondary">
              –
            </Typography>
            <TextField
              label="Close"
              type="time"
              size="small"
              value={data[day]?.close ?? ""}
              onChange={(e) => updateDay(day, "close", e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              inputProps={{ "aria-label": `${capitalize(day)} close time` }}
              sx={{ width: 130 }}
            />
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

function RatesEditor({ data, onChange }: FormProps<RatesContent>) {
  function updateItem(index: number, field: keyof RateItem, value: string) {
    const next = data.items.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    );
    onChange({ items: next });
  }

  function addItem() {
    onChange({ items: [...data.items, { label: "", price: "", note: "" }] });
  }

  function removeItem(index: number) {
    onChange({ items: data.items.filter((_, i) => i !== index) });
  }

  return (
    <Stack spacing={2}>
      {data.items.map((item, index) => (
        <Paper
          key={index}
          variant="outlined"
          sx={{ p: 2, borderRadius: 2 }}
        >
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
            <Typography variant="caption" fontWeight={600} color="text.secondary">
              Rate Item {index + 1}
            </Typography>
            {data.items.length > 1 && (
              <Tooltip title="Remove this rate item">
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => removeItem(index)}
                  aria-label={`Remove rate item ${index + 1}`}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
          <Stack spacing={1.5}>
            <TextField
              label="Label"
              fullWidth
              size="small"
              value={item.label}
              onChange={(e) => updateItem(index, "label", e.target.value)}
              placeholder="e.g. Standard Rate"
              inputProps={{ "aria-label": `Rate item ${index + 1} label` }}
            />
            <TextField
              label="Price"
              fullWidth
              size="small"
              value={item.price}
              onChange={(e) => updateItem(index, "price", e.target.value)}
              placeholder="e.g. ₱200/hour"
              inputProps={{ "aria-label": `Rate item ${index + 1} price` }}
            />
            <TextField
              label="Note (optional)"
              fullWidth
              size="small"
              value={item.note ?? ""}
              onChange={(e) => updateItem(index, "note", e.target.value)}
              placeholder="e.g. Weekends only"
              inputProps={{ "aria-label": `Rate item ${index + 1} note` }}
            />
          </Stack>
        </Paper>
      ))}
      <Button
        variant="outlined"
        size="small"
        startIcon={<AddIcon />}
        onClick={addItem}
        sx={{ alignSelf: "flex-start" }}
      >
        Add Rate Item
      </Button>
    </Stack>
  );
}

function FaqEditor({ data, onChange }: FormProps<FaqContent>) {
  function updateItem(index: number, field: keyof FaqItem, value: string) {
    const next = data.items.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    );
    onChange({ items: next });
  }

  function addItem() {
    onChange({ items: [...data.items, { question: "", answer: "" }] });
  }

  function removeItem(index: number) {
    onChange({ items: data.items.filter((_, i) => i !== index) });
  }

  return (
    <Stack spacing={2}>
      {data.items.map((item, index) => (
        <Paper key={index} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
            <Typography variant="caption" fontWeight={600} color="text.secondary">
              FAQ Item {index + 1}
            </Typography>
            {data.items.length > 1 && (
              <Tooltip title="Remove this FAQ item">
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => removeItem(index)}
                  aria-label={`Remove FAQ item ${index + 1}`}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
          <Stack spacing={1.5}>
            <TextField
              label="Question"
              fullWidth
              size="small"
              value={item.question}
              onChange={(e) => updateItem(index, "question", e.target.value)}
              inputProps={{ "aria-label": `FAQ item ${index + 1} question` }}
            />
            <TextField
              label="Answer"
              fullWidth
              size="small"
              multiline
              rows={3}
              value={item.answer}
              onChange={(e) => updateItem(index, "answer", e.target.value)}
              inputProps={{ "aria-label": `FAQ item ${index + 1} answer` }}
            />
          </Stack>
        </Paper>
      ))}
      <Button
        variant="outlined"
        size="small"
        startIcon={<AddIcon />}
        onClick={addItem}
        sx={{ alignSelf: "flex-start" }}
      >
        Add FAQ Item
      </Button>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Preview panel — renders a read-only summary of current draft state
// ---------------------------------------------------------------------------

interface PreviewProps {
  section: ContentSection;
  content: SectionContent;
}

function ContentPreview({ section, content }: PreviewProps) {
  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
        <VisibilityIcon fontSize="small" color="action" />
        <Typography variant="subtitle2" fontWeight={700} color="text.secondary">
          Live Preview
        </Typography>
      </Box>
      <Paper
        variant="outlined"
        sx={{ p: 2.5, borderRadius: 2, bgcolor: "grey.50", minHeight: 120 }}
        aria-label="Content preview"
      >
        {section === "hero" && (() => {
          const c = content as HeroContent;
          return (
            <Stack spacing={0.5}>
              <Typography variant="h5" fontWeight={700}>{c.headline || <em style={{ color: "#bbb" }}>Headline…</em>}</Typography>
              <Typography variant="body1" color="text.secondary">{c.subheading || <em style={{ color: "#bbb" }}>Subheading…</em>}</Typography>
              <Box sx={{ mt: 1 }}>
                <Button variant="contained" size="small" disabled>
                  {c.cta_text || "CTA Button"}
                </Button>
              </Box>
            </Stack>
          );
        })()}

        {section === "about" && (() => {
          const c = content as AboutContent;
          return (
            <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
              {c.text || <em style={{ color: "#bbb" }}>About text…</em>}
            </Typography>
          );
        })()}

        {section === "contact" && (() => {
          const c = content as ContactContent;
          return (
            <Stack spacing={0.5}>
              <Typography variant="body2"><strong>Phone:</strong> {c.phone || <em style={{ color: "#bbb" }}>—</em>}</Typography>
              <Typography variant="body2"><strong>Email:</strong> {c.email || <em style={{ color: "#bbb" }}>—</em>}</Typography>
              <Typography variant="body2"><strong>Facebook:</strong> {c.facebook_url || <em style={{ color: "#bbb" }}>—</em>}</Typography>
            </Stack>
          );
        })()}

        {section === "hours" && (() => {
          const c = content as HoursContent;
          return (
            <Stack spacing={0.25}>
              {DAYS.map((day) => (
                <Typography key={day} variant="body2">
                  <strong>{capitalize(day)}:</strong>{" "}
                  {c[day].open} – {c[day].close}
                </Typography>
              ))}
            </Stack>
          );
        })()}

        {section === "rates" && (() => {
          const c = content as RatesContent;
          return (
            <Stack spacing={1}>
              {c.items.map((item, i) => (
                <Box key={i}>
                  <Typography variant="body2" fontWeight={600}>
                    {item.label || <em style={{ color: "#bbb" }}>Label</em>}
                    {" — "}
                    {item.price || <em style={{ color: "#bbb" }}>Price</em>}
                  </Typography>
                  {item.note && (
                    <Typography variant="caption" color="text.secondary">
                      {item.note}
                    </Typography>
                  )}
                </Box>
              ))}
            </Stack>
          );
        })()}

        {section === "faq" && (() => {
          const c = content as FaqContent;
          return (
            <Stack spacing={1.5}>
              {c.items.map((item, i) => (
                <Box key={i}>
                  <Typography variant="body2" fontWeight={600}>
                    Q: {item.question || <em style={{ color: "#bbb" }}>Question…</em>}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                    A: {item.answer || <em style={{ color: "#bbb" }}>Answer…</em>}
                  </Typography>
                </Box>
              ))}
            </Stack>
          );
        })()}
      </Paper>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

/**
 * WebsiteContentEditor
 *
 * Fetches the current content for `section` on mount, renders the matching
 * section editor, and saves changes via PATCH /api/content/:section.
 * A live ContentPreview is shown below the form.
 *
 * Requirements: 13.1, 13.2, 13.3
 */
export function WebsiteContentEditor({ section }: WebsiteContentEditorProps) {
  const [draft, setDraft] = useState<SectionContent>(defaultContent(section));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [snackOpen, setSnackOpen] = useState(false);

  // -------------------------------------------------------------------------
  // Fetch current content on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSaveError(null);

    fetch(`/api/content/${section}`)
      .then((res) => res.json())
      .then((json: { data?: { content?: SectionContent } | null }) => {
        if (!cancelled && json.data?.content) {
          // Merge with defaults so missing keys (e.g. hours days not yet in DB)
          // always have a valid fallback value and never cause undefined access.
          const defaults = defaultContent(section);
          const merged =
            section === "hours"
              ? { ...defaults, ...json.data.content }
              : json.data.content;
          setDraft(merged as SectionContent);
        }
      })
      .catch(() => {
        // Non-fatal: fall back to defaults
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [section]);

  // -------------------------------------------------------------------------
  // Save handler
  // -------------------------------------------------------------------------
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);

    try {
      const res = await fetch(`/api/content/${section}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft }),
      });

      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        setSaveError(json.error ?? "Failed to save. Please try again.");
      } else {
        setSnackOpen(true);
      }
    } catch {
      setSaveError("Network error. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }, [section, draft]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const label = sectionLabel(section);

  return (
    <Box component="section" aria-label={`${label} editor`}>
      <Card>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          {/* Section title */}
          <Typography variant="h6" component="h2" fontWeight={700} mb={1}>
            {label}
          </Typography>
          <Divider sx={{ mb: 3 }} />

          {/* Loading skeleton */}
          {loading ? (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                py: 4,
                justifyContent: "center",
              }}
            >
              <CircularProgress size={24} />
              <Typography variant="body2" color="text.secondary">
                Loading content…
              </Typography>
            </Box>
          ) : (
            <>
              {/* Section-specific form */}
              {section === "hero" && (
                <HeroEditor
                  data={draft as HeroContent}
                  onChange={(d) => setDraft(d)}
                />
              )}
              {section === "about" && (
                <AboutEditor
                  data={draft as AboutContent}
                  onChange={(d) => setDraft(d)}
                />
              )}
              {section === "contact" && (
                <ContactEditor
                  data={draft as ContactContent}
                  onChange={(d) => setDraft(d)}
                />
              )}
              {section === "hours" && (
                <HoursEditor
                  data={draft as HoursContent}
                  onChange={(d) => setDraft(d)}
                />
              )}
              {section === "rates" && (
                <RatesEditor
                  data={draft as RatesContent}
                  onChange={(d) => setDraft(d)}
                />
              )}
              {section === "faq" && (
                <FaqEditor
                  data={draft as FaqContent}
                  onChange={(d) => setDraft(d)}
                />
              )}

              {/* Inline error */}
              {saveError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {saveError}
                </Alert>
              )}

              {/* Save button */}
              <Box sx={{ mt: 3, display: "flex", justifyContent: "flex-end" }}>
                <Button
                  variant="contained"
                  startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                  onClick={handleSave}
                  disabled={saving}
                  aria-label={`Save ${label}`}
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
              </Box>

              {/* Live preview (Requirement 13.3) */}
              <Box sx={{ mt: 4 }}>
                <Divider sx={{ mb: 3 }} />
                <ContentPreview section={section} content={draft} />
              </Box>
            </>
          )}
        </CardContent>
      </Card>

      {/* Success Snackbar */}
      <Snackbar
        open={snackOpen}
        autoHideDuration={4000}
        onClose={() => setSnackOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnackOpen(false)}
          severity="success"
          sx={{ width: "100%" }}
        >
          {label} saved successfully.
        </Alert>
      </Snackbar>
    </Box>
  );
}
