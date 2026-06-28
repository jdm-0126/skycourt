import { z } from "zod";

// Valid homepage section identifiers
export const HOMEPAGE_SECTIONS = [
  "about",
  "rates",
  "gallery",
  "amenities",
  "faq",
] as const;
export type HomepageSection = (typeof HOMEPAGE_SECTIONS)[number];

export const DEFAULT_HOMEPAGE_ORDER: HomepageSection[] = [
  "about",
  "rates",
  "gallery",
  "amenities",
  "faq",
];

/**
 * Validation schema for the system settings PATCH body.
 *
 * All fields are optional so callers can update a subset of settings in one
 * request.  At least one key must be present (enforced by `.refine`).
 *
 * Requirements: 22.1
 */
export const settingsSchema = z
  .object({
    site_name: z
      .string()
      .min(1, "Site name must not be empty")
      .max(200, "Site name must be 200 characters or fewer")
      .optional(),

    contact_email: z
      .string()
      .email("Contact email must be a valid email address")
      .optional(),

    maintenance_mode: z.boolean().optional(),

    theme_mode: z.enum(["light", "dark"]).optional(),

    map_url: z.string().url("Map URL must be a valid URL").optional().or(z.literal("")),

    homepage_order: z
      .array(z.enum(HOMEPAGE_SECTIONS))
      .min(1, "Homepage order must have at least one section")
      .optional(),
  })
  .refine(
    (data) =>
      data.site_name !== undefined ||
      data.contact_email !== undefined ||
      data.maintenance_mode !== undefined ||
      data.theme_mode !== undefined ||
      data.map_url !== undefined ||
      data.homepage_order !== undefined,
    { message: "At least one setting must be provided" }
  );

export type SettingsInput = z.infer<typeof settingsSchema>;
