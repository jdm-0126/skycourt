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
 *   rates   — items: [{ tier, price, per, subtitle, description, features[], cta, ctaHref, highlighted? }]
 *   faq     — items: [{ question, answer }]
 *
 * Requirements: 13.1, 13.2, 13.3
 */

import React, { useState, useEffect, useCallback } from "react";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SaveIcon from "@mui/icons-material/Save";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";

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
  visible?: boolean;
  promo?: string;
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
  tier: string;
  price: string;
  per: string;
  subtitle: string;
  description: string;
  features: string[];
  cta: string;
  ctaHref: string;
  highlighted?: boolean;
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
      return { text: "", visible: true, promo: "" };
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
      return {
        items: [
          {
            tier: "",
            price: "",
            per: "/hr",
            subtitle: "",
            description: "",
            features: [""],
            cta: "Book a Court",
            ctaHref: "/member/bookings/new",
            highlighted: false,
          },
        ],
      };
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
  const isVisible = data.visible !== false;
  return (
    <Stack spacing={2}>
      {/* Visibility toggle */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          p: 1.5,
          border: "1px solid",
          borderColor: isVisible ? "success.light" : "warning.light",
          borderRadius: 2,
          bgcolor: isVisible ? "success.50" : "warning.50",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {isVisible ? (
            <VisibilityIcon fontSize="small" color="success" />
          ) : (
            <VisibilityOffIcon fontSize="small" color="warning" />
          )}
          <Box>
            <Typography variant="body2" fontWeight={600}>
              About Section Visibility
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {isVisible
                ? "Section is visible on the public home page"
                : "Section is hidden — promo or nothing is shown instead"}
            </Typography>
          </Box>
        </Box>
        <FormControlLabel
          control={
            <Switch
              checked={isVisible}
              onChange={(e) => onChange({ ...data, visible: e.target.checked })}
              color="success"
              inputProps={{ "aria-label": "Toggle about section visibility" }}
            />
          }
          label={isVisible ? "Visible" : "Hidden"}
          labelPlacement="start"
          sx={{ m: 0 }}
        />
      </Box>

      {/* About text */}
      <TextField
        label="About Text"
        fullWidth
        multiline
        rows={5}
        value={data.text}
        onChange={(e) => onChange({ ...data, text: e.target.value })}
        disabled={!isVisible && !data.promo}
        inputProps={{ "aria-label": "About section text" }}
        helperText="Shown when no Promo text is set and the section is visible."
      />

      {/* Promo override */}
      <TextField
        label="Promo / Special Offer Text (optional)"
        fullWidth
        multiline
        rows={3}
        value={data.promo ?? ""}
        onChange={(e) => onChange({ ...data, promo: e.target.value })}
        inputProps={{ "aria-label": "Promo text override" }}
        helperText={
          data.promo
            ? "✓ Promo text is set — this will replace the About text on the home page."
            : "Leave blank to show the About text. Fill in to replace About with a promotion."
        }
      />
    </Stack>
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
  function updateField(index: number, field: keyof RateItem, value: string | boolean) {
    const next = data.items.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    );
    onChange({ items: next });
  }

  function updateFeature(index: number, fi: number, value: string) {
    const next = data.items.map((item, i) => {
      if (i !== index) return item;
      const features = item.features.map((f, j) => (j === fi ? value : f));
      return { ...item, features };
    });
    onChange({ items: next });
  }

  function addFeature(index: number) {
    const next = data.items.map((item, i) =>
      i === index ? { ...item, features: [...(item.features ?? []), ""] } : item
    );
    onChange({ items: next });
  }

  function removeFeature(index: number, fi: number) {
    const next = data.items.map((item, i) =>
      i === index
        ? { ...item, features: item.features.filter((_, j) => j !== fi) }
        : item
    );
    onChange({ items: next });
  }

  function addItem() {
    onChange({
      items: [
        ...data.items,
        {
          tier: "",
          price: "",
          per: "/hr",
          subtitle: "",
          description: "",
          features: [""],
          cta: "Book a Court",
          ctaHref: "/member/bookings/new",
          highlighted: false,
        },
      ],
    });
  }

  function removeItem(index: number) {
    onChange({ items: data.items.filter((_, i) => i !== index) });
  }

  return (
    <Stack spacing={3}>
      {data.items.map((item, index) => (
        <Paper key={index} variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
          {/* Card header */}
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
            <Typography variant="subtitle2" fontWeight={700} color="text.secondary">
              Rate Card {index + 1}{item.tier ? ` — ${item.tier}` : ""}
            </Typography>
            {data.items.length > 1 && (
              <Tooltip title="Remove this rate card">
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => removeItem(index)}
                  aria-label={`Remove rate card ${index + 1}`}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>

          <Stack spacing={1.5}>
            {/* Row 1: Tier + highlighted toggle */}
            <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
              <TextField
                label="Tier Label"
                size="small"
                value={item.tier}
                onChange={(e) => updateField(index, "tier", e.target.value)}
                placeholder="e.g. Walk-in"
                inputProps={{ "aria-label": `Rate card ${index + 1} tier` }}
                sx={{ flex: 1 }}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={!!item.highlighted}
                    onChange={(e) => updateField(index, "highlighted", e.target.checked)}
                    color="primary"
                    size="small"
                  />
                }
                label={<Typography variant="caption">Highlighted</Typography>}
                sx={{ mt: 0.5, flexShrink: 0 }}
              />
            </Box>

            {/* Row 2: Price + per */}
            <Box sx={{ display: "flex", gap: 1.5 }}>
              <TextField
                label="Price"
                size="small"
                value={item.price}
                onChange={(e) => updateField(index, "price", e.target.value)}
                placeholder="e.g. ₱200"
                inputProps={{ "aria-label": `Rate card ${index + 1} price` }}
                sx={{ flex: 2 }}
              />
              <TextField
                label="Per"
                size="small"
                value={item.per}
                onChange={(e) => updateField(index, "per", e.target.value)}
                placeholder="/hr"
                inputProps={{ "aria-label": `Rate card ${index + 1} per unit` }}
                sx={{ flex: 1 }}
              />
            </Box>

            {/* Row 3: Subtitle */}
            <TextField
              label="Subtitle (caps label below price)"
              size="small"
              fullWidth
              value={item.subtitle}
              onChange={(e) => updateField(index, "subtitle", e.target.value)}
              placeholder="e.g. Recreational Play"
              inputProps={{ "aria-label": `Rate card ${index + 1} subtitle` }}
            />

            {/* Row 4: Description */}
            <TextField
              label="Description"
              size="small"
              fullWidth
              multiline
              rows={2}
              value={item.description}
              onChange={(e) => updateField(index, "description", e.target.value)}
              placeholder="Short description shown under the subtitle…"
              inputProps={{ "aria-label": `Rate card ${index + 1} description` }}
            />

            {/* Row 5: Features checklist */}
            <Box>
              <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
                Features (checklist items)
              </Typography>
              <Stack spacing={0.75}>
                {(item.features ?? []).map((feature, fi) => (
                  <Box key={fi} sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                    <TextField
                      size="small"
                      fullWidth
                      value={feature}
                      onChange={(e) => updateFeature(index, fi, e.target.value)}
                      placeholder={`Feature ${fi + 1}`}
                      inputProps={{ "aria-label": `Rate card ${index + 1} feature ${fi + 1}` }}
                    />
                    <Tooltip title="Remove feature">
                      <IconButton
                        size="small"
                        onClick={() => removeFeature(index, fi)}
                        aria-label={`Remove feature ${fi + 1}`}
                        disabled={(item.features ?? []).length <= 1}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ))}
                <Button
                  size="small"
                  variant="text"
                  startIcon={<AddIcon />}
                  onClick={() => addFeature(index)}
                  sx={{ alignSelf: "flex-start", mt: 0.25 }}
                >
                  Add feature
                </Button>
              </Stack>
            </Box>

            {/* Row 6: CTA label + href */}
            <Box sx={{ display: "flex", gap: 1.5 }}>
              <TextField
                label="Button Label"
                size="small"
                value={item.cta}
                onChange={(e) => updateField(index, "cta", e.target.value)}
                placeholder="e.g. Book a Court"
                inputProps={{ "aria-label": `Rate card ${index + 1} button label` }}
                sx={{ flex: 1 }}
              />
              <TextField
                label="Button Link"
                size="small"
                value={item.ctaHref}
                onChange={(e) => updateField(index, "ctaHref", e.target.value)}
                placeholder="/member/bookings/new"
                inputProps={{ "aria-label": `Rate card ${index + 1} button href` }}
                sx={{ flex: 1 }}
              />
            </Box>
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
        Add Rate Card
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
          if (c.visible === false) {
            return (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <VisibilityOffIcon fontSize="small" color="disabled" />
                <Typography variant="body2" color="text.disabled" fontStyle="italic">
                  Section is hidden on the public site.
                </Typography>
              </Box>
            );
          }
          if (c.promo) {
            return (
              <Stack spacing={0.5}>
                <Typography variant="overline" color="primary" fontWeight={700}>Special Offer</Typography>
                <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>{c.promo}</Typography>
              </Stack>
            );
          }
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
            <Stack spacing={1.5}>
              {c.items.map((item, i) => (
                <Box key={i} sx={{ p: 1.5, border: "1px solid", borderColor: item.highlighted ? "primary.main" : "divider", borderRadius: 1.5 }}>
                  <Typography variant="caption" sx={{ color: "primary.main", fontWeight: 700, letterSpacing: 1, display: "block" }}>
                    {item.tier || <em style={{ color: "#bbb" }}>Tier</em>}
                  </Typography>
                  <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.5 }}>
                    <Typography variant="h6" fontWeight={800} color="text.primary">
                      {item.price || "—"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{item.per}</Typography>
                  </Box>
                  <Typography variant="caption" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, display: "block" }}>
                    {item.subtitle}
                  </Typography>
                  {(item.features ?? []).slice(0, 3).map((f, fi) => (
                    <Typography key={fi} variant="caption" color="text.secondary" sx={{ display: "block" }}>✓ {f}</Typography>
                  ))}
                  {(item.features ?? []).length > 3 && (
                    <Typography variant="caption" color="text.disabled">+{item.features.length - 3} more…</Typography>
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
      <Accordion
        defaultExpanded={false}
        disableGutters
        elevation={0}
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: "12px !important",
          "&:before": { display: "none" },
          overflow: "hidden",
        }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          aria-controls={`${section}-content`}
          id={`${section}-header`}
          sx={{
            bgcolor: "grey.50",
            minHeight: 52,
            "& .MuiAccordionSummary-content": { alignItems: "center", gap: 1 },
          }}
        >
          <Typography variant="subtitle1" fontWeight={700}>{label}</Typography>
          {saving && <CircularProgress size={14} sx={{ ml: 1 }} />}
        </AccordionSummary>

        <AccordionDetails sx={{ p: { xs: 2, sm: 3 } }} id={`${section}-content`}>
          {loading ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, py: 4, justifyContent: "center" }}>
              <CircularProgress size={24} />
              <Typography variant="body2" color="text.secondary">Loading content…</Typography>
            </Box>
          ) : (
            <>
              {section === "hero" && (
                <HeroEditor data={draft as HeroContent} onChange={(d) => setDraft(d)} />
              )}
              {section === "about" && (
                <AboutEditor data={draft as AboutContent} onChange={(d) => setDraft(d)} />
              )}
              {section === "contact" && (
                <ContactEditor data={draft as ContactContent} onChange={(d) => setDraft(d)} />
              )}
              {section === "hours" && (
                <HoursEditor data={draft as HoursContent} onChange={(d) => setDraft(d)} />
              )}
              {section === "rates" && (
                <RatesEditor data={draft as RatesContent} onChange={(d) => setDraft(d)} />
              )}
              {section === "faq" && (
                <FaqEditor data={draft as FaqContent} onChange={(d) => setDraft(d)} />
              )}

              {saveError && (
                <Alert severity="error" sx={{ mt: 2 }}>{saveError}</Alert>
              )}

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

              <Box sx={{ mt: 4 }}>
                <Divider sx={{ mb: 3 }} />
                <ContentPreview section={section} content={draft} />
              </Box>
            </>
          )}
        </AccordionDetails>
      </Accordion>

      <Snackbar
        open={snackOpen}
        autoHideDuration={4000}
        onClose={() => setSnackOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert onClose={() => setSnackOpen(false)} severity="success" sx={{ width: "100%" }}>
          {label} saved successfully.
        </Alert>
      </Snackbar>
    </Box>
  );
}
